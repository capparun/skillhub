import {cli} from './lib/register.js';
import {filters,plan} from './lib/filters.js';
import {run} from './lib/engine.js';
import {openCurrentSearchDriver} from './lib/search-driver.js';
import {executeScopedOperation,PreparePreflightError} from './lib/site-scope.js';
import {updateTask} from './lib/task-store.js';

export async function prepareFilters(args,{openDriver=openCurrentSearchDriver,apply=run}={}) {
 const {file,page,operationId,__opencliOptionSources,...input}=args;
 plan(input);
 if(!/^[a-fA-F0-9]{16,128}$/.test(page ?? ''))throw new Error('需要 connect 返回的搜索页 targetId');
 if(!file || !operationId)throw new Error('需要任务文件和持久操作标识');
 const evidence=await executeScopedOperation(file,{operationId,kind:'prepare',payload:{page,filters:input}},async()=>{
  let driver;
  try {driver=await openDriver(page);}
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
 return evidence;
}
cli({site:'liepin',access:'write',name:'prepare',browser:false,
 description:'在已绑定搜索页清空并设置全部支持的筛选，不点击搜索；结果记录在本地任务',
 args:[...Object.entries(filters).map(([name,[label,kind]])=>({name,type:kind==='check'?'boolean':'string',positional:name==='keyword',help:label})),
  {name:'file',type:'string',required:true,help:'本地任务文件'},
  {name:'page',type:'string',required:true,help:'connect 返回的搜索页 targetId'},
  {name:'operationId',type:'string',required:true,help:'持久操作标识'}],
 columns:['applied','submitted'],func:async args=>[await prepareFilters(args)]});
