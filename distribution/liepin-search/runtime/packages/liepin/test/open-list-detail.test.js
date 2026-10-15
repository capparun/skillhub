import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask,updateTask,mergeListResults} from '../lib/task-store.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
import {authorizeTask,grantOperations} from '../lib/operation-gate.js';
import {openListDetail} from '../lib/open-list-detail.js';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-popup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 createTask(file);updateTask(file,t=>mergeListResults(t,[{source:'liepin',summary:'合成卡片',cardSelector:'#card',detailTarget:'#name'}],{roundId:'trial'}));
 createSiteScope(scope,{label:'测试',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 const o=readTask(file).unlinkedObservations[0],args={file,page:'A'.repeat(32),observationId:o.id,operationId:'open-one'};
 authorizeTask(file,{allowedKinds:['detail-open'],maxOperations:1,confirmedAt:now,scope:'读取一条',allowedRequests:[{kind:'detail-open',payload:{observationId:o.id,observationHash:o.hash,page:args.page}}]});
 return args;
}
test('single card click reads new detail and persists automatic linkage; rerun uses cache',async t=>{
 const args=fixture(t);let clicks=0,reads=0,closed=0;
 const child={page:'B'.repeat(32),url:'https://h.liepin.com/resume/showresumedetail/?res_id_encode=synthetic'};
 const options={pause:async()=>{},openDriver:async()=>({method:'observed-card-foreground',check:async()=>true,children:async()=>clicks?[child]:[],click:async()=>{clicks++;},read:async()=>{reads++;return {url:child.url,readyState:'complete',text:'工作经历\n合成职责\n教育经历\n合成学历'};},close:async()=>{closed++;}})};
 const result=await openListDetail(args,options);assert.ok(result.detail);
 await openListDetail(args,options);
 assert.equal(clicks,1);assert.equal(reads,1);assert.equal(closed,1);
 const task=readTask(args.file);assert.equal(task.candidates.length,1);assert.equal(task.unlinkedObservations[0].identityStatus,'linked');
 assert.equal(task.unlinkedObservations[0].link.method,'observed-card-foreground');
 assert.equal(task.operations[0].status,'completed');assert.equal(task.candidates[0].observations.length,2);
});
test('missing popup pauses the task and never clicks again',async t=>{
 const args=fixture(t);let clicks=0,closed=0;
 const options={pause:async()=>{},openDriver:async()=>({check:async()=>true,children:async()=>[],click:async()=>{clicks++;},read:async()=>assert.fail(),close:async()=>{closed++;}})};
 const result=await openListDetail(args,options);assert.equal(result.reason,'detail_tab_not_confirmed');
 assert.equal(readTask(args.file).status,'paused');await assert.rejects(openListDetail(args,options));assert.equal(clicks,1);assert.equal(closed,1);
});

test('explicit grants preserve old requests and never unpause a task',async t=>{
 const {grantOperations}=await import('../lib/operation-gate.js');
 const args=fixture(t),before=readTask(args.file),input={allowedRequests:[{kind:'detail',payload:{resumeId:'next',page:args.page}}],confirmedAt:new Date().toISOString(),scope:'明确追加一份详情'};
 grantOperations(args.file,input);
 const after=readTask(args.file);assert.equal(after.policy.maxOperations,before.policy.maxOperations+1);assert.equal(after.policy.requestHashes[0],before.policy.requestHashes[0]);
 assert.throws(()=>grantOperations(args.file,input),/重复请求/);
 updateTask(args.file,t=>({...t,status:'paused'}));
 assert.throws(()=>grantOperations(args.file,{...input,allowedRequests:[{kind:'detail',payload:{resumeId:'third'}}]}),/待核对操作/);
});

test('waits for the same detail to load without another click or another target',async t=>{
 const args=fixture(t);let clicks=0,reads=0,closed=0;
 const child={page:'C'.repeat(32),url:'https://h.liepin.com/resume/showresumedetail/?res_id_encode=loading_one'};
 const result=await openListDetail(args,{pause:async()=>{},openDriver:async()=>({check:async()=>true,children:async()=>clicks?[child]:[],click:async()=>{clicks++;},
  read:async actual=>{assert.equal(actual.page,child.page);reads++;return reads===1?{url:child.url,readyState:'loading',text:''}:{url:child.url,readyState:'complete',text:'工作经历\n合成已加载职责'};},close:async()=>{closed++;}})});
 assert.ok(['partial','readable'].includes(result.detail.status));assert.equal(clicks,1);assert.equal(reads,2);assert.equal(closed,1);
});

for(const mismatch of [false,true])test(`identified card supports detail opening, mismatch=${mismatch}`,async t=>{
 const {detailTargets}=await import('../lib/detail-targets.js');
 const args=fixture(t);
 updateTask(args.file,task=>{task.unlinkedObservations=[];return mergeListResults(task,[{source:'liepin',resumeId:'known',summary:'合成卡片',cardSelector:'#card',detailTarget:'#name'}],{roundId:'known-round'});});
 const target=detailTargets(readTask(args.file))[0];args.observationId=target.id;
 // Add the identified observation without resetting the fixture policy.
 grantOperations(args.file,{confirmedAt:new Date().toISOString(),scope:'已识别卡片测试',allowedRequests:[{kind:'detail-open',payload:{observationId:target.id,observationHash:target.hash,page:args.page}}]});
 let clicks=0,reads=0;
 const child={page:'D'.repeat(32),url:`https://h.liepin.com/resume/showresumedetail/?res_id_encode=${mismatch?'wrong':'known'}`};
 const options={pause:async()=>{},openDriver:async()=>({check:async()=>true,children:async()=>clicks?[child]:[],click:async()=>{clicks++;},read:async()=>{reads++;return {url:child.url,readyState:'complete',text:'工作经历\n合成职责'};},close:async()=>{}})};
 const result=await openListDetail(args,options);
 if(mismatch){assert.equal(result.reason,'detail_identity_mismatch');assert.equal(reads,0);assert.equal(readTask(args.file).candidates[0].observations.length,1);}
 else {assert.equal(result.detail.resumeId,'known');await openListDetail(args,options);assert.equal(detailTargets(readTask(args.file))[0].hasDetail,true);assert.equal(readTask(args.file).candidates[0].observations.length,2);}
 assert.equal(clicks,1);
});

for(const mode of ['missing','lost','multiple'])test(`popup discovery preserves evidence without reclicking: ${mode}`,async t=>{
 const args=fixture(t);let clicks=0,closed=0;
 const old={page:'E'.repeat(32)};
 const result=await openListDetail(args,{pause:async()=>{},openDriver:async()=>({
  check:async()=>true,click:async()=>{clicks++;},
  children:async()=>{if(!clicks)return [old];if(mode==='lost')throw new Error('binding lost');
   return mode==='multiple'?[old,{page:'F'.repeat(32)},{page:'D'.repeat(32)}]:[old];},
  read:async()=>assert.fail('must not read an unconfirmed detail'),close:async()=>{closed++;}
 })});
 assert.equal(clicks,1);assert.equal(closed,1);assert.equal(readTask(args.file).status,'paused');
 assert.deepEqual(result.discovery.beforePages,[old.page]);
 assert.equal(result.discovery.samples.length,mode==='missing'?30:mode==='lost'?0:1);
 assert.equal(result.reason,mode==='missing'?'detail_tab_not_confirmed':mode==='lost'?'detail_discovery_failed':'multiple_new_detail_tabs');
 await assert.rejects(openListDetail(args));
});

test('detail click uses the unique name text rather than the wide container or icons',async()=>{
 const vm=await import('node:vm');const {inspectDetailClickTarget}=await import('../lib/open-list-detail.js');
 const container={matches:s=>s==='.new-resume-personal-name'},name={parentElement:null,textContent:'合成姓名'};name.parentElement=container;
 let names=[name];const context={location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem'},document:{querySelectorAll:s=>s==='#card .new-resume-personal-name'?[container]:names}};
 const run=()=>vm.runInNewContext(`(${inspectDetailClickTarget.toString()})({detailTarget:'#card .new-resume-personal-name'})`,context);
 assert.equal(run(),'#card .new-resume-personal-name > em');
 names=[];assert.equal(run(),null);names=[name,name];assert.equal(run(),null);
 names=[name];name.textContent=' ';assert.equal(run(),null);name.textContent='合成姓名';name.parentElement={};assert.equal(run(),null);
});
