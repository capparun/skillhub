import {readTask,updateTask} from './task-store.js';
import {requestFingerprint,resolveOperation,resumeTask} from './operation-gate.js';
import {authorizeScopedRetry} from './site-scope.js';
import {plan} from './filters.js';
import {inspect} from './dom.js';
import {openCurrentSearchDriver} from './search-driver.js';
import {createLiepinPage} from './page-connection.js';
import {LIEPIN_MANAGED,LIEPIN_MANAGED_SESSION,LIEPIN_SESSION,matchesConnection} from './connection.js';
import {checkReadRuntime} from './current-detail.js';

const searchUrl='https://h.liepin.com/search/getConditionItem';
const blankCode='LIEPIN_UNEXPECTED_BLANK_PAGE';
const pending=o=>['started','unknown','blocked','failed'].includes(o.status);
const now=()=>new Date().toISOString();

// One allowance for the entire shared scope, persisted before any navigation.
// A crash or failed recovery consumes it too; new tasks/operation IDs cannot reset it.
export function reserveBlankRecovery(file,{page,filters,previousOperationId,executorStopped}) {
 plan(filters);
 if(executorStopped!==true)throw new Error('必须确认原执行器已退出');
 const task=readTask(file),scope=task.siteScope&&readTask(task.siteScope.file);
 if(!scope || scope.id!==task.siteScope.id || scope.requirements.kind!=='liepin-site-scope')throw new Error('原共享范围缺失或已变化');
 const previous=task.operations.find(o=>o.operationId===previousOperationId);
 const scoped=scope.operations?.find(o=>o.taskId===task.id && o.taskOperationId===previousOperationId);
 const fingerprint=requestFingerprint({kind:'prepare',payload:{page,filters}});
 if(!/^[A-Fa-f0-9]{16,128}$/.test(page??'') || previous?.kind!=='prepare' || previous.fingerprint!==fingerprint
  || scoped?.fingerprint!==fingerprint || previous.evidence?.connectionFailure?.code!==blankCode
  || scoped.evidence?.connectionFailure?.code!==blankCode || !['unknown','failed'].includes(previous.status)
  || !['unknown','failed'].includes(scoped.status))throw new Error('仅恢复已记录白屏且原请求完全一致的筛选操作');
 if(task.status!=='paused' || scope.status!=='paused' || task.operations.filter(pending).length!==1 || scope.operations.filter(pending).length!==1)
  throw new Error('另有未核对操作或任务未暂停，不能恢复');
 const retryId=previousOperationId+'-blank-recovery';
 if(retryId.length>128 || task.operations.some(o=>o.operationId===retryId))throw new Error('恢复操作标识无效或已使用');
 // Use the same budget policy as authorizeScopedRetry, before touching Chrome.
 for(const [state,max] of [[task,task.policy?.maxOperations],[scope,scope.requirements.maxOperations]]) {
  const e=state.requirements?.budgetExtension;
  const limit=e && Number.isSafeInteger(e.limit) && e.limit>=100 && e.reviewer?.trim() && e.reason?.trim() && Number.isFinite(Date.parse(e.confirmedAt))?e.limit:100;
  if(!Number.isSafeInteger(max) || max>=limit)throw new Error('原累计预算没有一次恢复余量');
 }
 const attempt={taskId:task.id,previousOperationId,operationId:retryId,page,status:'reserved',startedAt:now()};
 updateTask(task.siteScope.file,s=>{
  if(s.id!==scope.id || s.blankRecovery)throw new Error('共享范围的一次白屏恢复已使用；停止，不再刷新');
  if(s.status!=='paused' || s.operations.filter(pending).length!==1 || !s.operations.some(o=>o.operationId===scoped.operationId && o.status===scoped.status))throw new Error('范围状态已变化');
  s.blankRecovery=attempt;return s;
 });
 updateTask(file,t=>{t.events.push({type:'blank_recovery_reserved',...attempt});return t;});
 return {task,previous,scoped,attempt};
}

// Official API only. No Chrome restart, extension edits, stealth injection,
// stale-target fallback, cookies, or evaluation on the blank document.
export async function reopenBlankSearch(pageId,{createPage=createLiepinPage,send,bind,wait=ms=>new Promise(r=>setTimeout(r,ms)),managed=LIEPIN_MANAGED,checkRuntime=checkReadRuntime}={}) {
 if(!managed)throw new Error('自动恢复仅支持原 official-managed 搜索目标');
 checkRuntime();
 const manager=await createPage({session:LIEPIN_MANAGED_SESSION});
 const tabs=await manager.tabs();
 if(tabs.length!==1 || tabs[0].page!==pageId || tabs[0].url!=='about:blank' || !matchesConnection(tabs[0]))throw new Error('原目标不再是唯一空白页；不覆盖用户页面或新建标签');
 const reader=await createPage();await reader.closeWindow();
 const client=(!send || !bind)?await import(new URL('daemon-client.js',import.meta.resolve('@jackwener/opencli/browser/page')).href):null;
 send??=client.sendCommandFull;bind??=client.bindTab;
 const result=await send('navigate',{session:LIEPIN_MANAGED_SESSION,surface:'adapter',siteSession:'persistent',windowMode:'foreground',page:pageId,url:searchUrl});
 if(result.page!==pageId)throw new Error('恢复返回了其他目标；停止');
 let ready=false;
 for(let i=0;i<40;i++) {
  const current=await manager.tabs();
  if(current.length!==1 || current[0].page!==pageId || !matchesConnection(current[0]))throw new Error('恢复目标发生变化');
  const tab=current[0];
  if(tab.url && ![searchUrl,searchUrl+'#session','about:blank'].includes(tab.url))throw new Error('恢复跳转到非搜索页；检查登录或验证');
  if([searchUrl,searchUrl+'#session'].includes(tab.url) && tab.title==='找简历'){ready=true;break;}
  if(i<39)await wait(250);
 }
 if(!ready)throw new Error('恢复页面未就绪；不再次打开');
 await manager.selectTab(pageId);
 await bind(LIEPIN_SESSION);
 const rebound=await (await createPage()).tabs();
 if(rebound.length!==1 || rebound[0].page!==pageId || !matchesConnection(rebound[0]))throw new Error('读取连接未绑定原目标');
}

export async function recoverBlankPrepare(args,{reopen=reopenBlankSearch,openDriver=openCurrentSearchDriver,prepare}={}) {
 const {file,page,filters,previousOperationId,executorStopped}=args;
 const {task,previous,scoped,attempt}=reserveBlankRecovery(file,args);
 let driver;
 const mark=(status,extra={})=>updateTask(task.siteScope.file,s=>{s.blankRecovery={...s.blankRecovery,status,...extra,updatedAt:now()};return s;});
 try {
  mark('reopening');await reopen(page);
  driver=await openDriver(page,{onAction:event=>updateTask(file,t=>{t.events.push({type:'browser_action',operationId:attempt.operationId,...event});return t;})});let readback;
  {
   const controls=await driver.evaluate(inspect,{mode:'controls'});
   const selected=await driver.evaluate(inspect,{mode:'selection-summary'});
   if([controls,selected].some(s=>!s || ![searchUrl,searchUrl+'#session'].includes(s.url) || s.readyState!=='complete' || !s.searchUi || s.blank || s.loading || s.login || s.risk || s.blocked)
    || controls.url!==selected.url)throw new Error('恢复现场未就绪，保留未知操作');
   // Do not erase persisted/user-selected criteria. Only an empty, verified new
   // search document may reconstruct the unfinished prepare's complete criteria.
   if(!Array.isArray(controls.nonemptyInputs) || controls.nonemptyInputs.length || !Array.isArray(selected.selected) || selected.selected.length)
    throw new Error('恢复后仍有条件或草稿，保留现场；不自动清空重放');
   readback={url:controls.url,observedAt:now(),values:{recoveredEmpty:true},selected:[],drafts:[],page};
  }
  mark('reconciled',{readback});
  const resolution={outcome:'abandoned',reviewer:'bounded-blank-recovery',reviewedAt:now(),executorStopped:true,evidence:{readback,priorEffects:'unknown_before_navigation',filtersLost:true}};
  // Abandoned preserves the original unknown evidence; never label it unexecuted.
  resolveOperation(task.siteScope.file,{...resolution,operationId:scoped.operationId});
  resolveOperation(file,{...resolution,operationId:previous.operationId});
  const resume={reviewer:resolution.reviewer,confirmedAt:now(),reason:'一次恢复后核对空搜索页，仅重建未完成筛选，不提交搜索'};
  resumeTask(task.siteScope.file,resume);resumeTask(file,resume);
  authorizeScopedRetry(file,{previousOperationId,operationId:attempt.operationId,...resume,prepareReadback:readback});
  mark('continuing');
  prepare??=(await import('../prepare.js')).prepareFilters;
  const result=await prepare({file,page,operationId:attempt.operationId,...filters},{recoverBlank:false,openDriver:async target=>{
   if(target!==page)throw new Error('恢复目标改变');
   return {...driver,close:async()=>{}};
  }});
  mark('completed');return {...result,recovery:{attempts:1,previousOperationId,operationId:attempt.operationId}};
 }catch(error){
  mark('stopped',{reason:typeof error.code==='string'?error.code:'RECOVERY_STOPPED'});
  // Fail closed also when interruption happens between resolve/resume/grant.
  for(const target of [task.siteScope.file,file])updateTask(target,t=>{t.status='paused';t.events.push({type:'blank_recovery_stopped',at:now(),operationId:attempt.operationId});return t;});
  throw error;
 }finally{await driver?.close();}
}
