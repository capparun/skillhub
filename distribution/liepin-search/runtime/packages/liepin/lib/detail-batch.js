import fs from 'node:fs';
import {readTask,updateTask} from './task-store.js';
import {detailTargets} from './detail-targets.js';
import {openListDetail,openListDetailDriver} from './open-list-detail.js';

export function createDetailBatch(file,{id,page,observationIds,order},{validatePage=page=>/^[a-fA-F0-9]{16,128}$/.test(page ?? '')}={}) {
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(id ?? '') || !validatePage(page))throw new Error('需要有效批次 ID 和当前搜索页 targetId');
 if(!Array.isArray(observationIds) || observationIds.length<1 || observationIds.length>30 || new Set(observationIds).size!==observationIds.length)throw new Error('明确选择 1–30 条不重复的当前页记录');
 let batch;
 updateTask(file,task=>{
  task.detailBatches ??= [];
  if(task.detailBatches.some(b=>b.id===id))throw new Error('批次已存在，请继续原批次');
  const targets=detailTargets(task);
  const readingOrder=order??(task.executionPreferences?.readingMode==='content-led-visible-review'?'page':'requested');
  if(!['page','requested'].includes(readingOrder))throw Error('详情队列顺序须为page或requested');
  const positions=new Map(targets.map((target,index)=>[target.id,index]));
  const orderedIds=readingOrder==='page'?[...observationIds].sort((a,b)=>(positions.get(a)??Infinity)-(positions.get(b)??Infinity)):observationIds;
  const items=orderedIds.map((observationId,index)=>{
   const target=targets.find(t=>t.id===observationId);
   if(!target)throw new Error('列表记录不存在或缺少详情入口');
   return {observationId,observationHash:target.hash,operationId:`batch-${id}-${index}`,status:target.hasDetail?'skipped':'pending'};
  });
  batch={id,page,items,order:readingOrder,status:'pending',createdAt:new Date().toISOString()};
  task.detailBatches.push(batch);return task;
 });
 return {...batch,allowedRequests:batch.items.filter(i=>i.status==='pending').map(i=>({kind:'detail-open',payload:{observationId:i.observationId,observationHash:i.observationHash,page}}))};
}

export async function runDetailBatch({file,id,intervalMs=3000,maxItems=30},{readDetail=openListDetail,openDriver=openListDetailDriver,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
 if(!Number.isSafeInteger(intervalMs) || intervalMs<1000 || intervalMs>60000)throw new Error('条目间隔须为 1000–60000 毫秒；间隔不是账号安全保证');
 if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>30)throw new Error('单次处理条数须为 1–30');
 const lock=`${file}.detail-batch.lock`;
 const fd=fs.openSync(lock,'wx',0o600);
 let finalClose;
 try {
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,id,startedAt:new Date().toISOString()}));
  let batch=readTask(file).detailBatches?.find(b=>b.id===id);
  if(!batch)throw new Error('批次不存在');
  if(batch.status==='completed')return batch;
  if(readTask(file).status==='paused')throw new Error('任务已暂停，先核对原操作结果并恢复任务');
  const change=fn=>updateTask(file,task=>{fn(task.detailBatches.find(b=>b.id===id));return task;});
  change(b=>{b.status='running';delete b.error;});
  let executed=0;
  for(const item of batch.items) {
   if(['completed','skipped'].includes(item.status))continue;
   try {
    const current=readTask(file);
    const operation=current.operations?.find(o=>o.operationId===item.operationId);
    if(operation?.status==='closed' && ['abandoned','not-executed'].includes(operation.resolution?.outcome)) {
     change(b=>{Object.assign(b.items.find(i=>i.operationId===item.operationId),{status:'skipped',reason:operation.resolution.outcome});});continue;
    }
    const target=detailTargets(current).find(t=>t.id===item.observationId);
    if(!target || target.hash!==item.observationHash)throw new Error('批次原列表证据已变化，未继续打开');
    // A completed operation can be replayed locally after a crash between the
    // detail save and the queue checkpoint. Never assign a new operation ID.
    if(target.hasDetail) {change(b=>{b.items.find(i=>i.operationId===item.operationId).status='skipped';});continue;}
    if(executed>=maxItems){
     change(b=>{b.status='pending';b.yieldReason='invocation_item_limit';});
     return readTask(file).detailBatches.find(b=>b.id===id);
    }
    // Preserve spacing across separate Adapter invocations as well.
    const lastCompleted=readTask(file).detailBatches.find(b=>b.id===id).lastReadAt;
    if(executed)await pause(intervalMs);
    else if(lastCompleted){const remaining=intervalMs-(Date.now()-Date.parse(lastCompleted));if(remaining>0)await pause(Math.min(intervalMs,remaining));}
    change(b=>{b.items.find(i=>i.operationId===item.operationId).status='running';});
    const result=await readDetail({file,page:batch.page,observationId:item.observationId,operationId:item.operationId,returnToList:true},{
     openDriver:async(...args)=>{
      const driver=await openDriver(...args);finalClose=()=>driver.close();
      return {...driver,close:async()=>{}};
     },
    });
    executed++;
    if(!['partial','readable'].includes(result.detail?.status))throw new Error(result.reason ?? result.detail?.status ?? '详情尚未确认');
    change(b=>{b.lastReadAt=new Date().toISOString();delete b.yieldReason;Object.assign(b.items.find(i=>i.operationId===item.operationId),{status:'completed',resumeId:result.detail.resumeId,completedAt:b.lastReadAt});});
    if(result.returnError)throw new Error('详情已保存，但返回搜索页失败：'+result.returnError);
   }catch(error){change(b=>{b.status='paused';b.error=error.message;});throw error;}
  }
  change(b=>{b.status='completed';b.completedAt=new Date().toISOString();});
  return readTask(file).detailBatches.find(b=>b.id===id);
 }finally{
  try{if(finalClose)await finalClose();}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
