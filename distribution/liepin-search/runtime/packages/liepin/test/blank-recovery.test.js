import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask,updateTask} from '../lib/task-store.js';
import {authorizeTask} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope,executeScopedOperation} from '../lib/site-scope.js';
import {BlankPageError} from '../lib/page-failure.js';
import {recoverBlankPrepare,reopenBlankSearch} from '../lib/blank-recovery.js';
import {prepareFilters} from '../prepare.js';
const page='A'.repeat(32),filters={keyword:'合成测试'},url='https://h.liepin.com/search/getConditionItem';
async function fixture(t,kind='prepare') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blank-recovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json');
 createTask(file);createSiteScope(scope,{label:'synthetic',maxOperations:2,confirmedAt:new Date().toISOString()});bindSiteScope(file,scope);
 const request={operationId:'original',kind,payload:{page,filters}};
 authorizeTask(file,{allowedKinds:[kind],allowedRequests:[request],maxOperations:2,confirmedAt:new Date().toISOString(),scope:'synthetic'});
 await assert.rejects(executeScopedOperation(file,request,async()=>{throw new BlankPageError();}));
 const args={file,page,filters,previousOperationId:'original',executorStopped:true};
 return {file,scope,args};
}
const driver=()=>({evaluate:async()=>({url,readyState:'complete',searchUi:true,nonemptyInputs:[],selected:[]}),close:async()=>{}});
const options={reopen:async()=>{},openDriver:async()=>driver(),prepare:args=>prepareFilters(args,{openDriver:async()=>({close:async()=>{}}),apply:async()=>({applied:[{field:'keyword',value:filters.keyword}]})})};
test('one recovery preserves unknown history, shared budget and reconstructed prepare evidence',async t=>{
 const {file,scope,args}=await fixture(t);
 const result=await recoverBlankPrepare(args,options);
 assert.equal(result.submitted,false);assert.equal(result.recovery.attempts,1);
 for(const f of [file,scope]){
  const task=readTask(f);assert.equal(task.operations.length,2);
  assert.equal(task.operations[0].resolution.previous.status,'unknown');
  assert.equal(task.operations[0].resolution.outcome,'abandoned');
  assert.equal(task.operations[1].status,'completed');
 }
 assert.equal(readTask(scope).blankRecovery.status,'completed');
 assert.equal(readTask(file).policy.maxOperations,2); // Recovery uses the already-authorized free slot.
});
test('second white screen stops and repeated invocation cannot navigate again',async t=>{
 const {file,scope,args}=await fixture(t);let navigations=0;
 const opts={...options,reopen:async()=>{navigations++;},prepare:a=>prepareFilters(a,{openDriver:async()=>({close:async()=>{}}),apply:async()=>{throw new BlankPageError();}})};
 await assert.rejects(recoverBlankPrepare(args,opts),/about:blank/);
 const next={...args,previousOperationId:'original-blank-recovery'};
 await assert.rejects(recoverBlankPrepare(next,opts),/一次白屏恢复已使用/);
 assert.equal(navigations,1);assert.equal(readTask(scope).blankRecovery.status,'stopped');
 assert.equal(readTask(file).operations[1].status,'unknown');
});
test('dirty, loading, login and risk scenes cannot authorize or replay filters',async t=>{
 for(const bad of [{nonemptyInputs:[{value:'existing'}]},{selected:[{text:'existing'}]},{loading:true},{login:true},{risk:true},{url:'about:blank'}]){
  const {file,args}=await fixture(t);let calls=0;
  await assert.rejects(recoverBlankPrepare(args,{...options,openDriver:async()=>({...driver(),evaluate:async()=>({...await driver().evaluate(),...bad})}),prepare:async()=>{calls++;}}));
  assert.equal(calls,0);assert.equal(readTask(file).operations[0].status,'unknown');
 }
});
test('reject changed payload, live executor and non-prepare writes before navigation',async t=>{
 for(const change of [{filters:{keyword:'changed'}},{executorStopped:false}]){
  const {args}=await fixture(t);await assert.rejects(recoverBlankPrepare({...args,...change},{reopen:async()=>assert.fail('no navigation')}));
 }
 const {args}=await fixture(t,'favorite');await assert.rejects(recoverBlankPrepare(args,{reopen:async()=>assert.fail('no navigation')}),/仅恢复/);
});
test('crash reservation survives a fresh caller and cannot be reset with another task',async t=>{
 const {args,scope}=await fixture(t);
 await assert.rejects(recoverBlankPrepare(args,{...options,reopen:async()=>{throw new Error('interrupted');}}));
 await assert.rejects(recoverBlankPrepare(args,options),/一次白屏恢复已使用/);
 assert.equal(readTask(scope).operations.length,1);
});
test('budget exhaustion rejects before reserving recovery or navigation',async t=>{
 const {args,scope}=await fixture(t);updateTask(scope,s=>{s.requirements.maxOperations=100;return s;});
 await assert.rejects(recoverBlankPrepare(args,options),/预算/);assert.equal(readTask(scope).blankRecovery,undefined);
});
test('official recovery sends exactly one explicit navigation and refuses a nonblank owned tab',async()=>{
 let navigated=false,calls=0,closed=0;
 const manager={tabs:async()=>[{page,url:navigated?url:'about:blank',title:'找简历'}],selectTab:async()=>{}};
 const reader={closeWindow:async()=>{closed++;},tabs:async()=>[{page,url}]};
 const deps={managed:true,checkRuntime:()=>{},createPage:async opts=>opts?manager:reader,bind:async()=>{},send:async(action,params)=>{
  assert.equal(action,'navigate');assert.equal(params.page,page);assert.equal(params.url,url);calls++;navigated=true;return {page};
 }};
 await reopenBlankSearch(page,deps);assert.equal(calls,1);assert.equal(closed,1);
 await assert.rejects(reopenBlankSearch(page,deps),/唯一空白页/);assert.equal(calls,1);
});
test('prepare opt-in catches blank after persistence and closure, never other errors',async t=>{
 const {file,scope}=await fixture(t); // make a fresh authorized case for the wrapper
 const dir=path.dirname(file),fresh=path.join(dir,'fresh.json'),s2=path.join(dir,'fresh-scope.json');
 createTask(fresh);createSiteScope(s2,{label:'fresh',maxOperations:2,confirmedAt:new Date().toISOString()});bindSiteScope(fresh,s2);
 authorizeTask(fresh,{allowedKinds:['prepare'],allowedRequests:[{kind:'prepare',payload:{page,filters}}],maxOperations:2,confirmedAt:new Date().toISOString(),scope:'fresh'});
 let closed=false;
 const result=await prepareFilters({file:fresh,page,operationId:'one',...filters,recoverBlank:true},{openDriver:async()=>({close:async()=>{closed=true;}}),apply:async()=>{throw new BlankPageError();},recover:async args=>{
  assert.equal(closed,true);assert.equal(readTask(fresh).operations[0].status,'unknown');assert.equal(args.executorStopped,true);return {recovery:'invoked'};
 }});
 assert.equal(result.recovery,'invoked');assert.equal(readTask(scope).operations.length,1);
});

test('readback connection stays alive until resumed prepare finishes, then closes once',async t=>{
 const {args}=await fixture(t);let closed=0,opened=0;
 await recoverBlankPrepare(args,{reopen:async()=>{},openDriver:async()=>{opened++;return {...driver(),close:async()=>{closed++;}};},prepare:async(a,opts)=>{
  assert.equal(closed,0);const d=await opts.openDriver(a.page);await d.evaluate();await d.close();assert.equal(closed,0);
  return options.prepare(a);
 }});
 assert.equal(opened,1);assert.equal(closed,1);
});
