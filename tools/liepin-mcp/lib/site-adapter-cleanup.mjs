import {updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
/** Record evidence, not reusable authority: old IDs never grant a future close. */
export async function cleanupAdapterChildren(tabs,{file,operationId,onAction=()=>{}}){
 const ids=tabs.opened(),failed=[];
 if(!ids.length)return;
 const record=(tabId,status,error)=>updateTask(file,task=>{
  task.adapterCleanup??=[];
  const item=task.adapterCleanup.find(x=>x.operationId===operationId&&x.tabId===tabId);
  const value={operationId,tabId,status,updatedAt:new Date().toISOString(),...(error?{error}:{}),authority:'current-call-only'};
  if(item){Object.assign(item,value);if(!error)delete item.error;}else task.adapterCleanup.push(value);
  return task;
 });
 for(const id of ids){
  record(id,'pending');
  try{
   onAction({phase:'dispatching',description:'关闭本次点击遗留的详情标签',tabId:id});
   await tabs.closeChild(id);record(id,'closed');
   onAction({phase:'returned',description:'本次详情标签关闭指令已返回；未单独回读标签列表',tabId:id});
  }catch(error){record(id,'failed',error.message);failed.push(id);}
 }
 if(failed.length)throw Error(`详情标签清理未完成：${failed.join(', ')}；已记录待核对，不凭历史ID自动认领`);
}
