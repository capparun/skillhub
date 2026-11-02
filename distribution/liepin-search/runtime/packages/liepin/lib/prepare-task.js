import {filters,plan} from './filters.js';
import {run} from './engine.js';
import {openCurrentSearchDriver} from './search-driver.js';
import {executeScopedOperation,PreparePreflightError} from './site-scope.js';
import {updateTask} from './task-store.js';

export async function prepareFilters(args,{openDriver=openCurrentSearchDriver,apply=run,recoverBlank=false,recover,validatePage=page=>/^[a-fA-F0-9]{16,128}$/.test(page ?? ''),execute=executeScopedOperation}={}) {
 const {file,page,operationId,recoverBlank:recoveryOption,__opencliOptionSources,...input}=args;
 plan(input);
 if(!validatePage(page))throw new Error('需要 connect 返回的搜索页 targetId');
 if(!file || !operationId)throw new Error('需要任务文件和持久操作标识');
 let evidence;
 try {evidence=await execute(file,{operationId,kind:'prepare',payload:{page,filters:input}},async()=>{
  let driver;
  try {driver=await openDriver(page,{onAction:event=>updateTask(file,task=>{task.events.push({type:'browser_action',operationId,...event});return task;})});}
  catch(error) {throw new PreparePreflightError(error);}
  try {
   const result=await apply(driver,input,{submit:false,onFilterProgress:progress=>{
    updateTask(file,task=>{
     const operation=task.operations.find(item=>item.operationId===operationId);
     if(!operation || operation.status!=='started')throw new Error('筛选操作不再处于执行状态');
     // This checkpoint survives failures and process interruption. It records
     // control readback, not proof that the platform applied every condition.
     operation.filterProgress={...progress,verification:'control-readback',updatedAt:new Date().toISOString()};
     return task;
    });
   }});
   return {status:'completed',evidence:{applied:result.applied,submitted:false,siteQueryMayHaveRun:true,warning:'未点击搜索按钮；清空或选择筛选可能触发站点自动查询'}};
  }finally{await driver.close();}
 });
 }catch(error){
  const {connectionFailureEvidence}=await import('./page-failure.js');
  if(!(recoverBlank || recoveryOption===true) || !connectionFailureEvidence(error))throw error;
  recover??=(await import('./blank-recovery.js')).recoverBlankPrepare;
  return recover({file,page,filters:input,previousOperationId:operationId,executorStopped:true});
 }
 return evidence;
}
