import {readTask,updateTask} from './task-store.js';

const targetId=value=>typeof value==='string' && /^[a-fA-F0-9]{16,128}$/.test(value);

// Cleanup authority comes from a completed popup operation AND its persisted
// candidate snapshot. A URL, title, group name or manually opened detail alone
// never grants ownership. Old records without a parent target are preserved.
export function detailCleanupTargets(task,parentPage) {
 if(!targetId(parentPage))throw new Error('需要原搜索页 targetId');
 const targets=[];
 for(const operation of task.operations??[]) {
  const e=operation.evidence;
  if(operation.kind!=='detail-open' || operation.status!=='completed'
   || e?.parentPage!==parentPage || e.method!=='observed-card-managed-tab'
   || !targetId(e.detailPage) || e.detailPage===parentPage || e.returnError
   || !['readable','partial'].includes(e.detail?.status))continue;
  const candidate=task.candidates.find(c=>c.key===`liepin:${e.detail.resumeId}`);
  if(!candidate?.observations.some(o=>o.stage==='detail'
   && o.roundId===`detail-${operation.operationId}`
   && JSON.stringify(o.data)===JSON.stringify(e.detail)))continue;
  let url;
  try{url=new URL(e.detail.url);}catch{continue;}
  if(url.origin!=='https://h.liepin.com' || url.pathname!=='/resume/showresumedetail/'
   || url.searchParams.get('res_id_encode')!==e.detail.resumeId)continue;
  if(targets.some(t=>t.page===e.detailPage))continue;
  targets.push({page:e.detailPage,url:url.href,operationId:operation.operationId});
 }
 return targets;
}

export async function cleanupSavedDetails({file,page},{driver}={}) {
 const task=readTask(file);
 if(task.status==='paused' || task.operations?.some(o=>['started','unknown','blocked','failed'].includes(o.status)))
  throw new Error('仍有执行中或结果未知的操作，保留浏览器现场');
 const targets=detailCleanupTargets(task,page),results=[];
 const eligible=new Set(targets.map(t=>t.page));
 const preserved=(task.operations??[]).filter(o=>o.kind==='detail-open'
  && o.evidence?.detailPage && (!o.evidence.parentPage || o.evidence.parentPage===page)
  && !eligible.has(o.evidence.detailPage)).map(o=>({operationId:o.operationId,
   page:o.evidence.detailPage,status:'preserved',reason:'ownership_or_saved_detail_not_verified'}));
 if(!driver)throw new Error('需要已核对的官方管理会话');
 const parent=await driver.checkParent(page);
 for(const target of targets) {
  // Write intent before dispatch. An interrupted close is never blindly
  // replayed: the next run must inspect the exact target again.
  try {
   const current=await driver.inspect(target.page);
   await driver.checkParent(page);
   if(!current){results.push({...target,status:'absent'});continue;}
   if(current.page!==target.page || current.url!==target.url){
    results.push({...target,status:'preserved',reason:'target_changed'});continue;
   }
   updateTask(file,t=>{t.events.push({type:'detail_cleanup_started',page:target.page,
    operationId:target.operationId,at:new Date().toISOString()});return t;});
   await driver.close(target.page);
   const remaining=await driver.inspect(target.page);
   await driver.checkParent(page);
   results.push({...target,status:remaining?'unconfirmed':'closed'});
  }catch(error){results.push({...target,status:'unconfirmed',reason:error.message});break;}
 }
 updateTask(file,t=>{t.events.push({type:'detail_cleanup_finished',parentPage:page,
  results,preserved,at:new Date().toISOString()});return t;});
 const complete=preserved.length===0 && results.length===targets.length && results.every(r=>['closed','absent'].includes(r.status));
 return {results,preserved,complete,...(complete && parent?{remainingUiCleanup:{...parent,
  reason:'close_verified_search_tab_in_browser_before_disconnect',savedGroups:'inspect_only_task_groups'}}:{})};
}
