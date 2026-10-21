import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,updateTask,mergeListResults,readTask} from '../lib/task-store.js';
import {detailTargets} from '../lib/detail-targets.js';
import {createDetailBatch,runDetailBatch} from '../lib/detail-batch.js';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-batch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);
 updateTask(file,task=>mergeListResults(task,[0,1,2].map(i=>({source:'liepin',summary:`card ${i}`,cardSelector:`#card${i}`,detailTarget:`#name${i}`})),{roundId:'trial'}));
 const batch=createDetailBatch(file,{id:'first',page:'A'.repeat(32),observationIds:detailTargets(readTask(file)).map(t=>t.id)});
 return {file,id:batch.id,batch};
}
test('queue checkpoints successful items and resumes original failed item, without repeating earlier reads',async t=>{
 const {file,id,batch}=fixture(t);const calls=[];let fail=true,closed=0;
 const deps={pause:async()=>{},openDriver:async()=>({close:async()=>closed++}),readDetail:async(args,options)=>{
  await options.openDriver(args.page);calls.push(args.operationId);
  if(args.operationId===batch.items[1].operationId && fail)throw new Error('connection lost');
  return {detail:{status:'partial',resumeId:args.operationId}};
 }};
 await assert.rejects(runDetailBatch({file,id},deps),/connection lost/);
 assert.equal(readTask(file).detailBatches[0].items[0].status,'completed');
 assert.equal(readTask(file).detailBatches[0].status,'paused');assert.equal(closed,1);
 fail=false;assert.equal((await runDetailBatch({file,id},deps)).status,'completed');
 assert.deepEqual(calls,[batch.items[0].operationId,batch.items[1].operationId,batch.items[1].operationId,batch.items[2].operationId]);
 await runDetailBatch({file,id},deps);assert.equal(calls.length,4);assert.equal(closed,2);
});
test('return failure preserves completed detail and stops before the next candidate',async t=>{
 const {file,id}=fixture(t);let calls=0;
 await assert.rejects(runDetailBatch({file,id},{readDetail:async()=>{calls++;return {detail:{status:'readable',resumeId:'one'},returnError:'parent changed'};}}),/详情已保存/);
 const batch=readTask(file).detailBatches[0];assert.equal(calls,1);assert.equal(batch.items[0].status,'completed');assert.equal(batch.items[1].status,'pending');assert.equal(batch.status,'paused');
});
test('paused task and concurrent batch lock prevent any new browser read',async t=>{
 const {file,id}=fixture(t);const deps={readDetail:async()=>assert.fail('must not read')};
 updateTask(file,t=>({...t,status:'paused'}));await assert.rejects(runDetailBatch({file,id},deps),/任务已暂停/);
 assert.equal(fs.existsSync(`${file}.detail-batch.lock`),false);
 fs.writeFileSync(`${file}.detail-batch.lock`,'existing owner');await assert.rejects(runDetailBatch({file,id},deps),/EEXIST/);
 assert.equal(fs.readFileSync(`${file}.detail-batch.lock`,'utf8'),'existing owner');
});

test('batch integrates real operation gates, saved details and identity links',async t=>{
 const {authorizeTask}=await import('../lib/operation-gate.js');
 const {createSiteScope,bindSiteScope}=await import('../lib/site-scope.js');
 const {file,id,batch}=fixture(t),now=new Date().toISOString(),scope=file+'.scope';
 createSiteScope(scope,{label:'batch fixture',maxOperations:3,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['detail-open'],maxOperations:3,confirmedAt:now,scope:'three fixture details',allowedRequests:batch.allowedRequests});
 let clicks=0,returns=0,closed=0;const children=[];
 const result=await runDetailBatch({file,id},{pause:async()=>{},openDriver:async(page,options)=>{
  assert.equal(page,batch.page);assert.equal(options.returnToList,true);
  return {check:async()=>true,children:async()=>[...children],click:async()=>{clicks++;children.push({page:String(clicks).repeat(32),url:`https://h.liepin.com/resume/showresumedetail/?res_id_encode=fixture${clicks}`});},
   read:async child=>({url:child.url,readyState:'complete',text:'工作经历\n合成职责'}),returnToList:async()=>{returns++;},close:async()=>{closed++;}};
 }});
 assert.equal(result.status,'completed');assert.equal(clicks,3);assert.equal(returns,3);assert.equal(closed,1);
 const saved=readTask(file);assert.equal(saved.candidates.length,3);assert.ok(saved.unlinkedObservations.every(o=>o.identityStatus==='linked'));
 assert.ok(saved.operations.every(o=>o.status==='completed'));
 await runDetailBatch({file,id},{readDetail:async()=>assert.fail('completed queue must not read')});
});

test('explicitly resolved abandoned item is retained as skipped while remaining queue continues',async t=>{
 const {file,id,batch}=fixture(t);
 updateTask(file,task=>({...task,operations:[{operationId:batch.items[0].operationId,status:'closed',resolution:{outcome:'abandoned'}}]}));
 const calls=[];
 const result=await runDetailBatch({file,id},{pause:async()=>{},readDetail:async args=>{calls.push(args.operationId);return {detail:{status:'partial',resumeId:args.operationId}};}});
 assert.equal(result.items[0].status,'skipped');assert.equal(result.items[0].reason,'abandoned');assert.equal(calls.length,2);
});

test('bounded invocations complete the original queue without rereading and preserve inter-call spacing',async t=>{
 const {file,id,batch}=fixture(t),calls=[],waits=[];
 const deps={pause:async ms=>waits.push(ms),readDetail:async args=>{calls.push(args.operationId);return {detail:{status:'partial',resumeId:args.operationId}};}};
 for(let i=0;i<3;i++){
  const result=await runDetailBatch({file,id,maxItems:1},deps);
  assert.equal(result.status,i===2?'completed':'pending');
  assert.equal(result.items.filter(item=>item.status==='completed').length,i+1);
  assert.equal(fs.existsSync(`${file}.detail-batch.lock`),false);
 }
 assert.deepEqual(calls,batch.items.map(item=>item.operationId));
 assert.equal(waits.length,2);assert.ok(waits.every(ms=>ms>0&&ms<=3000));
 await runDetailBatch({file,id,maxItems:1},deps);assert.equal(calls.length,3);
});
test('visible-reading queues follow page order unless a deliberate requested order is provided',t=>{
 const {file}=fixture(t);updateTask(file,task=>{task.executionPreferences={readingMode:'content-led-visible-review'};return task;});
 const ids=detailTargets(readTask(file)).map(t=>t.id),page='B'.repeat(32);
 const ordered=createDetailBatch(file,{id:'page-order',page,observationIds:[...ids].reverse()});assert.deepEqual(ordered.items.map(i=>i.observationId),ids);assert.equal(ordered.order,'page');
 const requested=createDetailBatch(file,{id:'requested-order',page,observationIds:[...ids].reverse(),order:'requested'});assert.deepEqual(requested.items.map(i=>i.observationId),[...ids].reverse());
 assert.throws(()=>createDetailBatch(file,{id:'invalid-order',page,observationIds:ids,order:'random'}),/顺序/);
});
