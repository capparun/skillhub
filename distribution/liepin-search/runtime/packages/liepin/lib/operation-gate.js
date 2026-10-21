import crypto from 'node:crypto';
import { updateTask } from './task-store.js';

const kinds = ['apply-search','prepare','inspect','search','restore-search','detail','detail-open','favorite-open','favorite-group-create','favorite','unfavorite','save-search','delete-search'];
export function cumulativeBudgetLimit(task){
 const extension=task.requirements?.budgetExtension;
 return extension&&Number.isSafeInteger(extension.limit)&&extension.limit>=100&&extension.reviewer?.trim()&&extension.reason?.trim()&&Number.isFinite(Date.parse(extension.confirmedAt))?extension.limit:100;
}
export function authorizeTask(file, {allowedKinds, maxOperations, confirmedAt, scope, allowedRequests}) {
  if (!Array.isArray(allowedKinds) || !allowedKinds.length || allowedKinds.some(k => !kinds.includes(k))) throw new Error('操作授权类型不受支持');
  if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 || maxOperations > 100) throw new Error('操作预算必须为 1–100 的整数；这不是平台安全频率');
  if (typeof scope !== 'string' || !scope.trim() || !Number.isFinite(Date.parse(confirmedAt))) throw new Error('必须提供用户确认的范围与确认时间');
  if (!Array.isArray(allowedRequests) || !allowedRequests.length || allowedRequests.some(r=>!allowedKinds.includes(r.kind) || !r.payload)) throw new Error('必须明确授权请求内容，不能只提供范围描述');
  const requestHashes=allowedRequests.map(requestFingerprint);
  return updateTask(file, task => {
    if (task.policy || task.operations?.length) throw new Error('已有授权或执行记录，不自动重置预算或解除暂停');
    return {...task,status:'ready',policy:{allowedKinds:[...new Set(allowedKinds)],maxOperations,confirmedAt,scope,requestHashes},operations:[]};
  });
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
}
export function requestFingerprint({kind,payload}) {
  return crypto.createHash('sha256').update(canonical({kind,payload})).digest('hex');
}
export function beginOperation(file, {operationId, kind, payload}) {
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(operationId)) throw new Error('必须提供稳定 operationId');
  if (!kinds.includes(kind) || !payload || typeof payload !== 'object') throw new Error('操作类型或请求无效');
  const fingerprint=requestFingerprint({kind,payload});
  let result;
  updateTask(file, task => {
    if (!task.policy?.allowedKinds.includes(kind)) throw new Error('本任务未授权该操作');
    const previous=task.operations.find(op => op.operationId===operationId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('同一 operationId 不得对应不同操作');
      if (previous.status === 'completed') {result={execute:false,operation:previous};return task;}
      throw new Error('操作结果未确认或已中止；请先核对业务状态，不能直接重试');
    }
    if (!task.policy.requestHashes.includes(fingerprint)) throw new Error('请求超出本次明确授权范围');
    if (task.status === 'paused' || task.operations.some(op => op.status==='started' || op.status==='unknown')) throw new Error('任务已暂停或有未确认操作；新调用不能绕过');
    if (task.operations.length >= task.policy.maxOperations) throw new Error('任务操作预算已用完，不自动扩大');
    if (task.operations.some(op => op.fingerprint === fingerprint) && !isVerifiedRetry(task,operationId,fingerprint)) throw new Error('相同请求已有操作记录，请使用原 operationId 核对结果，不以新 ID 重发');
    const operation={operationId,kind,payload:structuredClone(payload),fingerprint,status:'started',startedAt:new Date().toISOString()};
    task.operations.push(operation);result={execute:true,operation};return task;
  });
  return result;
}
export function finishOperation(file, operationId, {status, evidence}) {
  if (!['completed','blocked','unknown','failed'].includes(status)) throw new Error('不支持的操作终态');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || !Object.keys(evidence).length) throw new Error('必须记录非空业务结果证据');
  return updateTask(file, task => {
    const operation=task.operations?.find(op => op.operationId===operationId);
    if (!operation || operation.status !== 'started') throw new Error('操作不存在或已终结，不能覆盖先前结果');
    Object.assign(operation,{status,evidence,finishedAt:new Date().toISOString()});
    if (status !== 'completed') {task.status='paused';task.pauseReason={operationId,status};}
    return task;
  });
}

export async function executeOperation(file, request, execute) {
  const gate=beginOperation(file,request);
  if (!gate.execute) return gate.operation.evidence;
  let result;
  try { result=await execute(); }
  catch (error) {
    finishOperation(file,request.operationId,{status:'unknown',evidence:{reason:'execution_interrupted',code:String(error?.code ?? 'UNKNOWN')}});
    throw error;
  }
  // Callers must supply business verification; a delivered click is not a result.
  if (!result || !['completed','blocked','unknown','failed'].includes(result.status) || (result.evidence !== undefined && (!result.evidence || typeof result.evidence !== 'object' || Array.isArray(result.evidence) || !Object.keys(result.evidence).length)) || (result.status === 'completed' && !result.evidence)) {
    finishOperation(file,request.operationId,{status:'unknown',evidence:{reason:'missing_business_verification'}});
    throw new Error('缺少明确业务结果，任务已暂停');
  }
  finishOperation(file,request.operationId,{status:result.status,evidence:result.evidence ?? {reason:'no_detail'}});
  return result.evidence;
}

// Recovery records an independently checked outcome; it never repeats an action.
// Closing an unexecuted operation retains its fingerprint and budget reservation.
export function resolveOperation(file, input) {
  if (!input || !['completed','not-executed','abandoned'].includes(input.outcome)
    || typeof input.reviewer !== 'string' || !input.reviewer.trim()
    || !Number.isFinite(Date.parse(input.reviewedAt)) || input.executorStopped !== true
    || !input.evidence || typeof input.evidence !== 'object' || Array.isArray(input.evidence) || !Object.keys(input.evidence).length) {
    throw new Error('恢复前需要确认执行进程已停止，并提供人工核对人、时间、结果和非空证据');
  }
  return updateTask(file, task => {
    const operation = task.operations?.find(op => op.operationId === input.operationId);
    if (!operation || !['started','unknown','blocked','failed'].includes(operation.status)) throw new Error('没有待核对的操作；不能覆盖已完成结果');
    const previous = structuredClone(operation);
    operation.resolution = {outcome:input.outcome, reviewer:input.reviewer, reviewedAt:input.reviewedAt,
      evidence:structuredClone(input.evidence), executorStopped:true, previous};
    operation.status = input.outcome === 'completed' ? 'completed' : 'closed';
    if (input.outcome === 'completed') operation.evidence = structuredClone(input.evidence);
    operation.finishedAt = new Date().toISOString();
    // Resolving one outcome does not authorize more work. Resume is separate.
    task.status = 'paused';
    task.events.push({type:'operation_resolved',operationId:input.operationId,outcome:input.outcome,at:operation.finishedAt});
    return task;
  });
}

export function resumeTask(file, {reviewer, confirmedAt, reason}) {
  if (typeof reviewer !== 'string' || !reviewer.trim() || !Number.isFinite(Date.parse(confirmedAt))
    || typeof reason !== 'string' || !reason.trim()) throw new Error('恢复需要明确确认人、时间和原因');
  return updateTask(file, task => {
    if (task.status !== 'paused') throw new Error('任务未暂停');
    if (task.operations?.some(op => ['started','unknown','blocked','failed'].includes(op.status))) throw new Error('仍有操作结果尚未核对，不能恢复');
    task.status = 'ready';
    delete task.pauseReason;
    task.events.push({type:'task_resumed',reviewer,confirmedAt,reason,at:new Date().toISOString()});
    return task;
  });
}

// Extend an existing plan explicitly, without replacing earlier attempts or
// clearing a paused task. Site-wide budgets remain independently enforced.
export function grantOperations(file,{allowedRequests,confirmedAt,scope}) {
 if(!Array.isArray(allowedRequests) || !allowedRequests.length || allowedRequests.length>100
  || allowedRequests.some(r=>!kinds.includes(r.kind) || !r.payload)
  || !Number.isFinite(Date.parse(confirmedAt)) || typeof scope!=='string' || !scope.trim())throw new Error('追加操作需要明确请求、确认时间与范围');
 return updateTask(file,task=>{
  if(!task.policy || task.status==='paused' || task.operations.some(o=>['started','unknown','blocked','failed'].includes(o.status)))throw new Error('任务尚未授权或有待核对操作，不能追加');
  const hashes=allowedRequests.map(requestFingerprint);
  if(new Set(hashes).size!==hashes.length || hashes.some(h=>task.policy.requestHashes.includes(h)))throw new Error('重复请求不能追加预算');
  const limit=cumulativeBudgetLimit(task);
  if(task.policy.maxOperations+hashes.length>limit)throw new Error('任务累计预算超过已确认上限'+limit);
  task.policy.requestHashes.push(...hashes);task.policy.maxOperations+=hashes.length;
  task.policy.allowedKinds=[...new Set([...task.policy.allowedKinds,...allowedRequests.map(r=>r.kind)])];
  task.events.push({type:'operations_granted',requestHashes:hashes,confirmedAt,scope});return task;
 });
}

// Reapplication of reconciled prepare operations is explicit and separate from
// retrying non-execution. No other business action gains this exception.
export function resolvedForRetry(operation, prepareReadback) {
 return operation?.status === 'closed' && (
  operation.resolution?.outcome === 'not-executed'
  || (prepareReadback && operation.kind === 'prepare' && operation.resolution?.outcome === 'abandoned')
 );
}
export function isVerifiedRetry(task,operationId,fingerprint) {
 const grant=task.retryAuthorizations?.find(g=>g.operationId===operationId && g.fingerprint===fingerprint);
 if(!grant)return false;
 const matching=task.operations.filter(o=>o.fingerprint===fingerprint);
 return matching.length>0 && matching.at(-1).operationId===grant.previousOperationId
  && matching.every(o=>resolvedForRetry(o,grant.prepareReadback));
}
