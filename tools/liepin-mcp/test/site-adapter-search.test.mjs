import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {searchAdapterRound,readAdapterResults} from '../lib/site-adapter-search.mjs';
import {initializeWorkflow,approveRound} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/workflow.js';
import {readTask,updateTask,mergeListResults} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
import {grantOperations} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-search-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'task.json'),confirmedAt=new Date().toISOString();
 initializeWorkflow(file,{title:'合成',criteria:[{id:'skill',label:'技能',kind:'required',category:'skills',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成',pages:2,limit:1}}]});
 createSiteScope(file+'.scope',{label:'synthetic',maxOperations:3,confirmedAt});bindSiteScope(file,file+'.scope');approveRound(file,'trial',{confirmedAt,scope:'synthetic'});return {file,confirmedAt};
}
const url='https://h.liepin.com/search/getConditionItem';
test('official bound tab searches an approved round and saves each page without another connection',async t=>{
 const {file}=fixture(t),args={file,round_id:'trial',tab_id:'123'};let calls=0;
 const context={args,tab:{id:'123',url:async()=>url}};
 const result=await searchAdapterRound(context,{runSearch:async(driver,filters,{onPage})=>{
  calls++;assert.equal(filters.pages,2);const rows=[{resumeId:'synthetic1',summary:'first',page:1}];
  await onPage({rows,currentRows:rows,currentPage:1});assert.equal(readTask(file).candidates.length,1);
  rows.push({resumeId:'synthetic2',summary:'second',page:2});await onPage({rows,currentRows:[rows[1]],currentPage:2});
  return {rows,pages:2,status:'completed',applied:[],total:2};
 }});
 assert.equal(result.count,2);assert.equal(readTask(file).mcpSearch.rows.length,1);
 await searchAdapterRound({...context,tab:{id:'123',url:()=>assert.fail('cached round')}});assert.equal(calls,1);
});
test('official results adapter only reads current list and preserves raw observations',async t=>{
 const {file,confirmedAt}=fixture(t),args={file,operation_id:'results-one',tab_id:'123',limit:2};
 grantOperations(file,{allowedRequests:[{kind:'inspect',payload:{tab_id:'123',limit:2}}],confirmedAt,scope:'read current synthetic list'});
 let reads=0;const context={args,tab:{id:'123',url:async()=>url,evaluate:async(fn,{arg})=>{reads++;assert.equal(arg.mode,'results');return {url,rows:[{resumeId:'synthetic',summary:'原始合成卡片'}]};},act:()=>assert.fail('no click')}};
 assert.equal((await readAdapterResults(context)).count,1);await readAdapterResults(context);assert.equal(reads,1);
 assert.equal(readTask(file).candidates[0].observations[0].data.summary,'原始合成卡片');
});
test('adapter mismatch rejects before reading task or page',()=>{
 assert.throws(()=>searchAdapterRound({args:{file:'/nonexistent',tab_id:'2'},tab:{id:'1'}}),/绑定的页面/);
});

async function restoreFixture(t){
 const {file,confirmedAt}=fixture(t);const {runRound}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
 const {restorationRequest}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/search-restoration.js');
 await runRound(file,'trial',async()=>({status:'completed',rows:[{source:'liepin',summary:'合成旧观察'}]}));
 const args={file,round_id:'trial',tab_id:'123',restore:true,operation_id:'restore-adapter-one',reason:'合成空搜索页恢复验收'};
 grantOperations(file,{allowedRequests:[restorationRequest(readTask(file),'trial','123')],confirmedAt,scope:'synthetic explicit restore query'});
 const base={url,readyState:'complete',searchUi:true},scene={controls:{...base,nonemptyInputs:[]},'selection-summary':{...base,selected:[]},results:{...base,count:0,rows:[]}};
 let closed=0;return {file,args,scene,context:{args,tab:{id:'123',url:()=>assert.fail('injected driver only')}},driver:{evaluate:async(fn,{mode})=>scene[mode],close:async()=>{closed++;}},closed:()=>closed};
}
test('official search restore preserves old collection, binds fresh results and never replays completed query',async t=>{
 const f=await restoreFixture(t);let calls=0;
 const deps={openRestoreDriver:async()=>f.driver,executeRestoreSearch:async(args,filters,options)=>{
  calls++;assert.equal(options.recovery,true);assert.equal(filters.keyword,'合成');
  const rows=[{source:'liepin',resumeId:'new-id',summary:'合成新结果'}];await options.onCheckpoint({rows,currentRows:rows,currentPage:1});
  return {status:'completed',rows,evidence:{pages:1}};
 }};
 assert.equal((await searchAdapterRound(f.context,deps)).snapshot.status,'completed');
 const cached=await searchAdapterRound({...f.context,tab:{id:'456',url:()=>assert.fail('old tab closed; current tab must not be read')}},{openRestoreDriver:()=>assert.fail('cached receipt must not reconnect')});
 assert.equal(cached.rows,undefined);assert.equal(cached.snapshot.rows.length,1);
 const task=readTask(f.file);assert.equal(calls,1);assert.equal(f.closed(),1);
 assert.ok(task.unlinkedObservations.some(o=>o.roundId==='trial'));assert.equal(task.mcpSearch.operationId,'trial-restore-restore-adapter-one');
 assert.equal(task.mcpSearch.rows[0].resumeId,'new-id');assert.equal(task.rounds[0].operationId,'round-trial');
});
test('official search restore refuses existing results before any search',async t=>{
 const f=await restoreFixture(t);f.scene.results.count=1;f.scene.results.rows=[{summary:'可复用结果'}];
 const result=await searchAdapterRound(f.context,{openRestoreDriver:async()=>f.driver,executeRestoreSearch:()=>assert.fail('must not submit')});
 assert.equal(result.snapshot.status,'failed');assert.equal(result.snapshot.businessActionStarted,false);assert.equal(f.closed(),1);
});
test('unknown restore query stays paused and cannot be replayed',async t=>{
 const f=await restoreFixture(t);let calls=0;
 await assert.rejects(searchAdapterRound(f.context,{openRestoreDriver:async()=>f.driver,executeRestoreSearch:async()=>{calls++;throw Error('synthetic disconnected');}}),/disconnected/);
 assert.equal(readTask(f.file).status,'paused');
 await assert.rejects(searchAdapterRound(f.context,{openRestoreDriver:()=>assert.fail('unknown operation must stop first')}));assert.equal(calls,1);
});


test('current-page results normalize observed row-class IDs and deduplicate the search identity',async t=>{
 const {file,confirmedAt}=fixture(t),tab_id='123';updateTask(file,task=>mergeListResults(task,[{source:'liepin',resumeId:'same-id',summary:'first snapshot'}],{roundId:'original'}));
 grantOperations(file,{allowedRequests:[{kind:'inspect',payload:{tab_id,limit:30}}],confirmedAt,scope:'synthetic current page'});
 const context={args:{file,tab_id,operation_id:'current-page',limit:30},tab:{id:tab_id,url:async()=>url,evaluate:async()=>({url,rows:[{rowClassResumeId:'same-id',summary:'raw current card'}]}),act:()=>assert.fail('must not click or search')}};
 await readAdapterResults(context);const task=readTask(file);assert.equal(task.candidates.length,1);assert.equal(task.unlinkedObservations?.length??0,0);assert.equal(task.mcpSearch.rows[0].resumeId,'same-id');assert.equal(task.mcpSearch.rows[0].identityEvidence,'row-class');assert.equal(task.candidates[0].observations.at(-1).data.summary,'raw current card');
});
test('current-page missing and conflicting identity remain unresolved instead of merging masked names',async t=>{
 const {file,confirmedAt}=fixture(t),tab_id='123';grantOperations(file,{allowedRequests:[{kind:'inspect',payload:{tab_id,limit:30}}],confirmedAt,scope:'synthetic identity conflict'});
 const rows=[{name:'某**',summary:'no identifier'},{name:'某**',summary:'conflicting sources',rowClassResumeId:'one',detailLinks:['https://h.liepin.com/resume/showresumedetail/?res_id_encode=two']}];
 await readAdapterResults({args:{file,tab_id,operation_id:'unresolved-page',limit:30},tab:{id:tab_id,url:async()=>url,evaluate:async()=>({url,rows}),act:()=>assert.fail('read only')}});const task=readTask(file);assert.equal(task.candidates.length,0);assert.equal(task.unlinkedObservations.length,2);assert.equal(task.unlinkedObservations[1].data.identityEvidence,'conflicting-row-class');
});
