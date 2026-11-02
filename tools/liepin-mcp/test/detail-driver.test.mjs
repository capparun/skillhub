import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {detailBatch,openMcpDetailDriver} from '../lib/detail-driver.mjs';
import {createTask,updateTask,mergeListResults,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {detailTargets} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-targets.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
function fakeClient({cancel,returnFailure=false}={}){
 let clicks=0,closes=0,returns=0;const searchUrl='https://h.liepin.com/search/getConditionItem';
 const parent={url:async()=>searchUrl,evaluate:async(fn,{arg})=>fn.name==='inspectSavedCard'?{matched:true,openerTimeOrigin:1}:'#name > em',
  act:async()=>{clicks++;cancel?.abort();return {openedTabs:[{tab:String(100+clicks)}]};},activate:async()=>{returns++;if(returnFailure)throw Error('activation failed');}};
 return {verify:async()=>{},tab:()=>parent,claimOpenedTab:id=>({id,url:async()=>`https://h.liepin.com/resume/showresumedetail/?res_id_encode=person${id}`,evaluate:async fn=>fn.name==='inspectExperienceExpanders'?[]:{url:`https://h.liepin.com/resume/showresumedetail/?res_id_encode=person${id}`,readyState:'complete',text:'工作经历\n合成职责'},cdp:{send:()=>assert.fail('no expanders')},close:async()=>{closes++;}}),counts:()=>({clicks,closes,returns})};
}
function taskFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-detail-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file);
 updateTask(file,task=>mergeListResults(task,[1,2].map(i=>({source:'liepin',summary:`合成卡片${i}`,cardSelector:`#card${i}`,detailTarget:`#name${i}`})),{roundId:'trial'}));
 return file;
}
async function authorizeBatch(t,c){
 const file=taskFixture(t),confirmedAt=new Date().toISOString();
 const batch=await detailBatch(c,{file,id:'first',tab_id:'123',observation_ids:detailTargets(readTask(file)).map(r=>r.id)});
 createSiteScope(file+'.scope',{label:'synthetic',maxOperations:2,confirmedAt});bindSiteScope(file,file+'.scope');
 authorizeTask(file,{allowedKinds:['detail-open'],allowedRequests:batch.allowedRequests,maxOperations:2,scope:'synthetic',confirmedAt});return file;
}
test('MCP batch reads two distinct details, links observations and resumes without clicks',async t=>{
 const c=fakeClient(),file=await authorizeBatch(t,c);
 assert.equal((await detailBatch(c,{file,id:'first',interval_ms:1000})).status,'completed');
 assert.deepEqual(c.counts(),{clicks:2,closes:2,returns:2});
 const saved=readTask(file);assert.equal(saved.candidates.length,2);assert.ok(saved.unlinkedObservations.every(o=>o.identityStatus==='linked'));
 assert.equal(new Set(saved.unlinkedObservations.map(o=>o.link.candidateKey)).size,2);
 await detailBatch(c,{file,id:'first',interval_ms:1000});assert.equal(c.counts().clicks,2);
});
test('return failure saves detail and pauses the queue before second click',async t=>{
 const c=fakeClient({returnFailure:true}),file=await authorizeBatch(t,c);
 await assert.rejects(detailBatch(c,{file,id:'first',interval_ms:1000}),/返回搜索页失败/);
 assert.deepEqual(c.counts(),{clicks:1,closes:1,returns:1});
 const saved=readTask(file);assert.equal(saved.candidates.length,1);assert.equal(saved.detailBatches[0].items[0].status,'completed');assert.equal(saved.detailBatches[0].status,'paused');
});
test('cancellation after click still captures child for cleanup and never clicks twice',async()=>{
 const controller=new AbortController(),c=fakeClient({cancel:controller});
 const driver=await openMcpDetailDriver(c,'123',{signal:controller.signal});const row={detailTarget:'#name'};
 await driver.check(row);await assert.rejects(driver.click(row),/取消/);await driver.close();
 assert.deepEqual(c.counts(),{clicks:1,closes:1,returns:0});
 await assert.rejects(driver.click(row));assert.equal(c.counts().clicks,1);
});
test('already-open detail saves visible content and caches result without closing user tab',async t=>{
 const {currentDetail}=await import('../lib/detail-driver.mjs');const file=taskFixture(t),confirmedAt=new Date().toISOString();
 createSiteScope(file+'.scope',{label:'synthetic',maxOperations:1,confirmedAt});bindSiteScope(file,file+'.scope');
 authorizeTask(file,{allowedKinds:['detail'],allowedRequests:[{kind:'detail',payload:{resumeId:'existing',page:'123'}}],maxOperations:1,scope:'synthetic',confirmedAt});
 let reads=0,connections=0;const url='https://h.liepin.com/resume/showresumedetail/?res_id_encode=existing';
 const c={verify:async()=>{connections++;},tab:()=>({url:async()=>url,evaluate:async()=>{reads++;return {url,readyState:'complete',text:'工作经历\n合成职责'};},close:()=>assert.fail('user tab'),act:()=>assert.fail('read-only')})};
 const args={file,operation_id:'existing',tab_id:'123',resume_id:'existing'};
 const result=await currentDetail(c,args);assert.equal(result.resumeId,'existing');assert.ok(['readable','partial'].includes(result.status));
 await currentDetail(c,args);assert.equal(reads,1);assert.equal(connections,1);assert.equal(readTask(file).candidates.length,1);
});
test('already-open detail fails before content read when duplicate identity parameters appear',async t=>{
 const {currentDetail}=await import('../lib/detail-driver.mjs');const file=taskFixture(t),confirmedAt=new Date().toISOString();
 createSiteScope(file+'.scope',{label:'synthetic',maxOperations:1,confirmedAt});bindSiteScope(file,file+'.scope');
 authorizeTask(file,{allowedKinds:['detail'],allowedRequests:[{kind:'detail',payload:{resumeId:'existing',page:'123'}}],maxOperations:1,scope:'synthetic',confirmedAt});
 let reads=0;const c={verify:async()=>{},tab:()=>({url:async()=>'https://h.liepin.com/resume/showresumedetail/?res_id_encode=existing&res_id_encode=other',evaluate:async()=>{reads++;}})};
 await assert.rejects(currentDetail(c,{file,operation_id:'existing',tab_id:'123',resume_id:'existing'}),/身份不符/);assert.equal(reads,0);assert.equal(readTask(file).candidates.length,0);
});

test('detail cleanup logs dispatch and receipt without claiming independent tab verification',async()=>{
 const c=fakeClient(),events=[];
 const driver=await openMcpDetailDriver(c,'123',{onAction:event=>events.push(event)});
 const row={detailTarget:'#name'};await driver.check(row);await driver.click(row);await driver.returnToList();
 assert.ok(events.some(e=>e.phase==='dispatching'&&e.description==='关闭本次打开的详情标签'));
 assert.ok(events.some(e=>e.phase==='returned'&&e.description.includes('关闭指令已返回')));
 assert.equal(events.some(e=>e.phase==='verified'),false);
 assert.ok(events.some(e=>e.phase==='observed'&&e.description.includes('地址与原搜索页一致')));
});
