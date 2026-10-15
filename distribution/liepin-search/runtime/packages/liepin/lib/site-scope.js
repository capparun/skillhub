import fs from 'node:fs';
import {createTask,readTask,updateTask} from './task-store.js';
import {beginOperation,finishOperation,requestFingerprint,isVerifiedRetry,resolvedForRetry} from './operation-gate.js';

export function createSiteScope(file, {label,maxOperations,confirmedAt}) {
  if (typeof label !== 'string' || !label.trim() || !Number.isSafeInteger(maxOperations) || maxOperations<1 || maxOperations>100
    || !Number.isFinite(Date.parse(confirmedAt))) throw new Error('站点范围需要名称、1–100 次授权预算和确认时间；预算不是安全频率');
  return createTask(file,{kind:'liepin-site-scope',label,maxOperations,confirmedAt});
}
export function bindSiteScope(file, scopeFile) {
  if (typeof scopeFile !== 'string' || !scopeFile.trim()) throw new Error('必须明确指定共用的站点范围文件');
  const scope=readTask(scopeFile);
  if(scope.requirements.kind!=='liepin-site-scope')throw new Error('不是猎聘站点范围文件');
  const canonical=fs.realpathSync(scopeFile);
  return updateTask(file,task=>{
    if(task.requirements.kind==='liepin-site-scope')throw new Error('站点范围不能绑定自身或其他范围');
    if(task.siteScope || task.operations?.length)throw new Error('已有绑定或执行记录；不能切换范围绕过预算');
    task.siteScope={file:canonical,id:scope.id};
    return task;
  });
}
function readBoundScope(task) {
  if(!task.siteScope)throw new Error('浏览器操作必须先绑定共用站点范围');
  const scope=readTask(task.siteScope.file);
  if(scope.id!==task.siteScope.id || scope.requirements.kind!=='liepin-site-scope')throw new Error('站点范围被替换，停止执行');
  return scope;
}
function reserveSite(task, request) {
  const id=`${task.id}-${request.operationId}`;
  // A new tab is not a new candidate or permission to repeat an action.
  const businessPayload=request.kind==='detail' ? {resumeId:request.payload.resumeId} : request.kind==='detail-open' ? {observationId:request.payload.observationId,observationHash:request.payload.observationHash} : request.payload;
  const fingerprint=requestFingerprint({kind:request.kind,payload:businessPayload});
  updateTask(task.siteScope.file,scope=>{
    if(scope.id!==task.siteScope.id)throw new Error('站点范围已变化');
    scope.operations ??= [];
    if(scope.status==='paused' || scope.operations.some(op=>['started','unknown','blocked','failed'].includes(op.status)))throw new Error('站点范围已暂停或有未确认操作，其他任务不能继续');
    if(scope.operations.length>=scope.requirements.maxOperations)throw new Error('站点共用预算已用完');
    if(scope.operations.some(op=>op.fingerprint===fingerprint) && !isVerifiedRetry(scope,id,fingerprint))throw new Error('站点范围已有相同业务请求，不跨任务或标签重复执行');
    scope.operations.push({operationId:id,taskId:task.id,taskOperationId:request.operationId,kind:request.kind,fingerprint,status:'started',startedAt:new Date().toISOString()});
    scope.status='ready';return scope;
  });
  return id;
}

// Only the prepare driver factory may classify its metadata-only preflight.
export class PreparePreflightError extends Error {
 constructor(cause) {super(`未执行筛选：${cause?.message ?? '页面连接前置检查失败'}`,{cause});this.name='PreparePreflightError';}
}

export async function executeScopedOperation(file, request, execute) {
  const task=readTask(file);
  readBoundScope(task);
  const gate=beginOperation(file,request);
  if(!gate.execute)return gate.operation.evidence;
  let scopeId;
  try {scopeId=reserveSite(task,request);}
  catch(error) {
    // This is known to precede browser execution, not an unknown click outcome.
    finishOperation(file,request.operationId,{status:'failed',evidence:{reason:'site_reservation_denied',browserStarted:false}});
    throw error;
  }
  let result,executionError;
  try {
    result=await execute();
    if(!result || !['completed','blocked','unknown','failed'].includes(result.status)
      || !result.evidence || typeof result.evidence!=='object' || Array.isArray(result.evidence) || !Object.keys(result.evidence).length) {
      throw new Error('缺少业务结果证据');
    }
  } catch(error) {
    executionError=error ?? new Error('执行中断');
    result=executionError instanceof PreparePreflightError && request.kind==='prepare'
      ? {status:'failed',evidence:{reason:'prepare_preflight_failed',businessActionStarted:false}}
      : {status:'unknown',evidence:{reason:'execution_interrupted'}};
    if(executionError instanceof ActionStoppedError) {
      result.evidence.actionFailure={reason:executionError.reason,outcome:executionError.outcome,
        ...(executionError.action?{action:executionError.action}:{}),
        ...(executionError.geometry?{geometry:executionError.geometry}:{})};
    }
  }
  // Persist scope first. A crash between the two saves leaves the task pending,
  // rather than exposing a completed task while its shared scope is still open.
  finishOperation(task.siteScope.file,scopeId,{status:result.status,evidence:{taskId:task.id,operationId:request.operationId,status:result.status}});
  finishOperation(file,request.operationId,result);
  if(executionError)throw executionError;
  return result.evidence;
}

export function authorizeScopedRetry(file,{previousOperationId,operationId,reviewer,confirmedAt,reason,prepareReadback,previousRequest,replacementRequest}) {
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(operationId??'') || !reviewer?.trim() || !reason?.trim() || !Number.isFinite(Date.parse(confirmedAt)))throw new Error('重试需要新操作ID、核对人、时间和原因');
 if(prepareReadback!==undefined) {
  const age=Date.now()-Date.parse(prepareReadback?.observedAt);
  if(prepareReadback?.url!=='https://h.liepin.com/search/getConditionItem#session'
    || !Number.isFinite(age) || age<0 || age>300000
    || !prepareReadback.values || typeof prepareReadback.values!=='object' || Array.isArray(prepareReadback.values)
    || !Object.keys(prepareReadback.values).length
    || Object.values(prepareReadback.values).some(value=>typeof value!=='string' && typeof value!=='boolean'))
   throw new Error('筛选重新应用需要五分钟内的搜索页控件回读');
 }
 const task=readTask(file),scope=readBoundScope(task);
 const previous=task.operations.find(o=>o.operationId===previousOperationId);
 const priorScope=scope.operations.find(o=>o.taskId===task.id && o.taskOperationId===previousOperationId);
 let replacementFingerprint,transportRetarget;
 if(previousRequest!==undefined || replacementRequest!==undefined) {
  const before=previousRequest?.payload,after=replacementRequest?.payload;
  if(prepareReadback || previousRequest?.kind!=='restore-search' || replacementRequest?.kind!=='restore-search'
   || previous?.kind!=='restore-search' || priorScope?.kind!=='restore-search'
   || !/^[A-Fa-f0-9]{16,128}$/.test(before?.page??'') || !/^[A-Fa-f0-9]{16,128}$/.test(after?.page??'')
   || before.page===after.page || requestFingerprint(previousRequest)!==previous.fingerprint
   || previous.fingerprint!==priorScope.fingerprint)throw new Error('仅允许已核实原请求的搜索恢复更换页面目标');
  const {page:oldPage,...originalBusiness}=before,{page:newPage,...replacementBusiness}=after;
  if(requestFingerprint({kind:'restore-search',payload:originalBusiness})!==requestFingerprint({kind:'restore-search',payload:replacementBusiness}))throw new Error('更换页面目标不能改变原搜索恢复条件');
  replacementFingerprint=requestFingerprint(replacementRequest);
  transportRetarget={from:oldPage,to:newPage};
 }
 const scopeId=`${task.id}-${operationId}`;
 const check=(state,prior,newId,max)=>{
  if(state.status==='paused' || state.operations.some(o=>['started','unknown','blocked','failed'].includes(o.status)))throw new Error('先核对并恢复所有未确认操作');
  if(!resolvedForRetry(prior,prepareReadback) || (prepareReadback && prior.kind!=='prepare'))throw new Error('仅允许重试已核实未执行的操作，或核对后重新应用已结束的筛选');
  if(replacementFingerprint && (prior.resolution?.outcome!=='not-executed' || state.operations.some(o=>o.fingerprint===replacementFingerprint)
   || state.retryAuthorizations?.some(g=>g.fingerprint===replacementFingerprint)))throw new Error('新目标已有请求记录或原操作效果未确认，不能更换目标重放');
  if(state.operations.some(o=>o.operationId===newId) || state.retryAuthorizations?.some(g=>g.operationId===newId || g.previousOperationId===prior.operationId))throw new Error('重试授权已存在');
  const extension=state.requirements?.budgetExtension;
  const limit=extension && Number.isSafeInteger(extension.limit) && extension.limit>=100
   && extension.reviewer?.trim() && extension.reason?.trim()
   && Number.isFinite(Date.parse(extension.confirmedAt))?extension.limit:100;
  if(!Number.isSafeInteger(max) || max>=limit)throw new Error(`累计操作预算超过${limit}`);
 };
 check(task,previous,operationId,task.policy?.maxOperations);check(scope,priorScope,scopeId,scope.requirements.maxOperations);
 const grant=(state,prior,newId)=>{
  state.retryAuthorizations??=[];
  const entry={operationId:newId,previousOperationId:prior.operationId,fingerprint:replacementFingerprint??prior.fingerprint,reviewer,confirmedAt,reason,
   ...(transportRetarget?{previousFingerprint:prior.fingerprint,transportRetarget}:{}),...(prepareReadback?{prepareReadback:structuredClone(prepareReadback)}:{})};
  if(replacementFingerprint && state.policy && !state.policy.requestHashes.includes(replacementFingerprint))state.policy.requestHashes.push(replacementFingerprint);
  state.retryAuthorizations.push(entry);state.events.push({type:'verified_retry_authorized',...entry});return state;
 };
 // Scope first: a crash leaves no task authorization to initiate browser work.
 updateTask(task.siteScope.file,current=>{const prior=current.operations.find(o=>o.operationId===priorScope.operationId);check(current,prior,scopeId,current.requirements.maxOperations);current.requirements.maxOperations++;return grant(current,prior,scopeId);});
 return updateTask(file,current=>{const prior=current.operations.find(o=>o.operationId===previousOperationId);check(current,prior,operationId,current.policy?.maxOperations);current.policy.maxOperations++;return grant(current,prior,operationId);});
}
import {ActionStoppedError} from './native-actions.js';
