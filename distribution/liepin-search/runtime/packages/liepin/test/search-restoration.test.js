import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createTask,readTask,updateTask,mergeListResults} from '../lib/task-store.js';
import {createSiteScope,bindSiteScope,executeScopedOperation} from '../lib/site-scope.js';
import {authorizeTask,grantOperations} from '../lib/operation-gate.js';
import {restoreSearch,restorationRequest,isEmptyRecoveryScene} from '../restore-search.js';
import {trialQuality} from '../lib/trial-quality.js';
import {inspect} from '../lib/dom.js';
const page='A'.repeat(32),url='https://h.liepin.com/search/getConditionItem',filters={keyword:'合成岗位',limit:1,pages:1};
async function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-restore-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 createTask(file,{title:'合成岗位',criteria:[]});createSiteScope(scope,{label:'合成恢复验收',maxOperations:5,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['search','restore-search'],maxOperations:5,confirmedAt:now,scope:'合成恢复',allowedRequests:[{kind:'search',payload:filters}]});
 await executeScopedOperation(file,{operationId:'round-trial',kind:'search',payload:filters},async()=>({status:'completed',evidence:{roundId:'trial',rows:[{source:'liepin',summary:'合成旧记录'}]}}));
 updateTask(file,t=>{t.rounds=[{id:'trial',phase:'trial',status:'completed',operationId:'round-trial',filters}];return mergeListResults(t,[{source:'liepin',summary:'合成旧记录'}],{roundId:'trial'});});
 const request=restorationRequest(readTask(file),'trial',page);grantOperations(file,{allowedRequests:[request],scope:'新的空页面恢复原条件',confirmedAt:now});
 const prior=readTask(file).operations[0],base={url,readyState:'complete',searchUi:true,timeOrigin:Date.parse(prior.finishedAt)+1000};
 const scene={controls:{...base,nonemptyInputs:[]},selected:{...base,selected:[]},results:{...base,count:0,rows:[]}};
 return {file,prior,scene,args:{file,roundId:'trial',page,operationId:'restore-one',reason:'合成新空文档，旧记录保留'}};
}
test('restoration preserves original query/history, saves a separate collection, and cached replay never searches',async t=>{
 const {file,prior,scene,args}=await fixture(t);let searches=0,opens=0,closed=0;
 const original=JSON.stringify(prior),oldId=readTask(file).unlinkedObservations[0].id;
 const resultOptions={openDriver:async()=>{opens++;return {evaluate:async(fn,req)=>{assert.equal(fn,inspect);return scene[{controls:'controls','selection-summary':'selected',results:'results'}[req.mode]];},close:async()=>{closed++;}};},
  executeSearch:async(actual,received,options)=>{searches++;assert.deepEqual(received,filters);assert.equal(options.recovery,true);await (await options.openDriver()).close();return {status:'completed',rows:[{source:'liepin',summary:'合成恢复记录'}],evidence:{targetId:page}};}};
 const result=await restoreSearch(args,resultOptions);assert.equal(result.status,'completed');await restoreSearch(args,resultOptions);
 assert.equal(searches,1);assert.equal(opens,1);assert.equal(closed,1);
 const task=readTask(file);assert.equal(JSON.stringify(task.operations[0]),original);assert.ok(task.unlinkedObservations.some(o=>o.id===oldId));
 assert.equal(task.rounds[0].operationId,'round-trial');assert.equal(task.rounds[0].restorations.length,1);assert.equal(task.rounds[0].restorations[0].status,'completed');
 assert.equal(trialQuality(task).rounds[0].listObservations,2);
 assert.equal(restorationRequest(task,'trial',page).payload.recoveryOf,'restore-one');
});
test('existing results or user draft prevent restore before any search and preserve the original operation',async t=>{
 const {file,prior,scene,args}=await fixture(t);scene.results.count=1;scene.results.rows=[{}];let closed=0;
 const result=await restoreSearch(args,{openDriver:async()=>({evaluate:async(fn,req)=>scene[{controls:'controls','selection-summary':'selected',results:'results'}[req.mode]],close:async()=>{closed++;}}),executeSearch:async()=>assert.fail('must not submit or prepare')});
 assert.equal(result.status,'failed');assert.equal(result.businessActionStarted,false);assert.equal(closed,1);assert.equal(readTask(file).operations[0].finishedAt,prior.finishedAt);assert.equal(readTask(file).status,'paused');
});
test('scene proof accepts an explicitly requested empty view but rejects drafts, selections, loading, risk and wrong UI',()=>{
 const after=new Date(1000).toISOString(),base={url,readyState:'complete',searchUi:true,timeOrigin:500};
 const fresh=()=>({controls:{...base,nonemptyInputs:[]},selected:{...base,selected:[]},results:{...base,count:0,rows:[]}});
 assert.equal(isEmptyRecoveryScene(fresh(),after),true);
 for(const change of [s=>{s.controls.searchUi=false;},s=>{s.controls.nonemptyInputs=[{value:'用户草稿'}];},s=>{s.selected.selected=[{text:'已选'}];},s=>{s.results.loading=true;},s=>{s.results.risk=true;},s=>{s.selected.url='about:blank';}]) {
  const scene=fresh();change(scene);assert.equal(isEmptyRecoveryScene(scene,after),false);
 }
});
test('changed original filters are rejected and execution exceptions still close the reader once',async t=>{
 const {file,scene,args}=await fixture(t);let closed=0;
 await assert.rejects(restoreSearch(args,{openDriver:async()=>({evaluate:async(fn,req)=>scene[{controls:'controls','selection-summary':'selected',results:'results'}[req.mode]],close:async()=>{closed++;}}),executeSearch:async()=>{throw Error('合成执行中断');}}),/合成执行中断/);
 assert.equal(closed,1);assert.equal(readTask(file).operations.at(-1).status,'unknown');
 updateTask(file,t=>{t.rounds[0].filters={...filters,keyword:'改变的岗位'};return t;});
 assert.throws(()=>restorationRequest(readTask(file),'trial',page),/条件未变/);
});

test('failed restoration retains machine-readable execution reason separately from recovery rationale',async t=>{
 const {file,scene,args}=await fixture(t);
 const result=await restoreSearch(args,{openDriver:async()=>({evaluate:async(fn,req)=>scene[{controls:'controls','selection-summary':'selected',results:'results'}[req.mode]],close:async()=>{}}),
  executeSearch:async()=>({status:'unknown',rows:[],evidence:{reason:'search_execution_interrupted',submissionAttempted:false}})});
 assert.equal(result.reason,'search_execution_interrupted');assert.equal(result.recoveryReason,args.reason);
 assert.equal(readTask(file).operations.at(-1).evidence.reason,'search_execution_interrupted');
});
