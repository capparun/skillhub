import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareFilters} from '../prepare.js';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
test('prepare uses the real filter engine without submission, closes connection and reuses completed operation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-prepare-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),page='A'.repeat(32),now=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'fixture',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['prepare'],maxOperations:1,confirmedAt:now,scope:'set keyword only',allowedRequests:[{kind:'prepare',payload:{page,filters:{keyword:'合成关键词'}}}]});
 let value='',opened=0,closed=0;const clicks=[];
 const options={openDriver:async()=>{opened++;return {
  evaluate:async(fn,request)=>({url:'https://h.liepin.com/search/getConditionItem',login:false,risk:false,blank:false,...(request.mode==='controls'?{submit:'#submit'}:{target:'#keyword',value})}),
  fillText:async(selector,next)=>{value=next;},click:async selector=>{clicks.push(selector);},close:async()=>{closed++;},
 };}};
 const args={file,page,operationId:'set-one',keyword:'合成关键词'};
 const result=await prepareFilters(args,options);assert.equal(result.submitted,false);assert.equal(result.siteQueryMayHaveRun,true);assert.match(result.warning,/自动查询/);assert.deepEqual(result.applied,[{field:'keyword',value:'合成关键词'}]);
 await prepareFilters(args,options);assert.equal(opened,1);assert.equal(closed,1);assert.ok(!clicks.includes('#submit'));assert.equal(readTask(file).operations[0].status,'completed');
});
test('invalid full-filter input is rejected before opening the browser',async()=>{
 await assert.rejects(prepareFilters({page:'A'.repeat(32),file:'absent',operationId:'x',salaryMin:20,salaryMax:10},{openDriver:async()=>assert.fail('no browser')}),/下限超过上限/);
});
test('a later control failure preserves checked fields and the active field without replay',async t=>{
 const {run}=await import('../lib/engine.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-prepare-progress-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),page='A'.repeat(32),now=new Date().toISOString();
 const input={keyword:'合成关键词',education:'本科'};
 createTask(file);createSiteScope(scope,{label:'fixture',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['prepare'],maxOperations:1,confirmedAt:now,scope:'fixture',allowedRequests:[{kind:'prepare',payload:{page,filters:input}}]});
 let value='',opened=0,closed=0;
 const options={apply:(driver,args,settings)=>run(driver,args,{...settings,pause:async()=>{}}),openDriver:async()=>{opened++;return {
  evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key==='keyword'?{target:'#keyword',value}:{})}),
  click:async()=>{},fillText:async(_s,v)=>{value=v;},close:async()=>{closed++;},
 };}};
 const args={file,page,operationId:'partial',...input};
 await assert.rejects(prepareFilters(args,options),/教育经历/);
 const task=readTask(file),op=task.operations[0];
 assert.equal(op.status,'unknown');assert.equal(task.status,'paused');
 assert.deepEqual(op.filterProgress.checked,[{field:'keyword',value:'合成关键词'}]);
 assert.equal(op.filterProgress.activeField,'education');assert.equal(op.filterProgress.verification,'control-readback');
 assert.equal(closed,1);
 await assert.rejects(prepareFilters(args,options),/不能直接重试/);assert.equal(opened,1);
});
test('prepare driver preflight failure is persisted as non-execution, without invoking filters',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-prepare-preflight-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),page='A'.repeat(32),now=new Date().toISOString();
 const input={keyword:'合成关键词'};createTask(file);createSiteScope(scope,{label:'fixture',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['prepare'],maxOperations:1,confirmedAt:now,scope:'fixture',allowedRequests:[{kind:'prepare',payload:{page,filters:input}}]});
 await assert.rejects(prepareFilters({file,page,operationId:'preflight',...input},{openDriver:async()=>{throw Error('wrong tab');},apply:async()=>assert.fail('must not execute filters')}),/未执行筛选/);
 const operation=readTask(file).operations[0];assert.equal(operation.status,'failed');assert.equal(operation.evidence.businessActionStarted,false);assert.equal(operation.evidence.reason,'prepare_preflight_failed');
 assert.equal(readTask(scope).operations[0].status,'failed');assert.equal(readTask(file).status,'paused');
});
