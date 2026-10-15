import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask,resolveOperation,resumeTask} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope,executeScopedOperation,authorizeScopedRetry} from '../lib/site-scope.js';
for(const outcome of ['not-executed','abandoned','unknown'])test(`explicit scoped retry requires proven non-execution: ${outcome}`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-retry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'test',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 const req={kind:'save-search',payload:{name:'test'}};
 authorizeTask(file,{allowedKinds:['save-search'],allowedRequests:[req],maxOperations:1,confirmedAt:now,scope:'test'});
 await executeScopedOperation(file,{...req,operationId:'old'},async()=>({status:'unknown',evidence:{reason:'inspection failed'}}));
 const scopeOp=readTask(scope).operations[0].operationId;
 if(outcome!=='unknown')for(const [f,id] of [[scope,scopeOp],[file,'old']]){
  resolveOperation(f,{operationId:id,outcome,reviewer:'test',reviewedAt:now,executorStopped:true,evidence:{reason:'checked'}});
  resumeTask(f,{reviewer:'test',confirmedAt:now,reason:'checked'});
 }
 const auth={previousOperationId:'old',operationId:'retry-one',reviewer:'test',confirmedAt:now,reason:'verified before click'};
 if(outcome!=='not-executed'){assert.throws(()=>authorizeScopedRetry(file,auth));return;}
 authorizeScopedRetry(file,auth);assert.throws(()=>authorizeScopedRetry(file,auth));
 let calls=0;const invoke=()=>executeScopedOperation(file,{...req,operationId:'retry-one'},async()=>{calls++;return {status:'completed',evidence:{saved:true}};});
 await invoke();await invoke();assert.equal(calls,1);
 for(const f of [file,scope]){const state=readTask(f);assert.equal(state.operations.length,2);assert.equal(state.operations[0].status,'closed');assert.equal(state.operations[0].resolution.previous.status,'unknown');assert.equal(state.operations[1].status,'completed');}
 assert.throws(()=>authorizeScopedRetry(file,{...auth,previousOperationId:'retry-one',operationId:'again'}));
});
for(const kind of ['prepare','save-search'])test(`reviewed partial reapplication stays limited to prepare: ${kind}`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-reapply-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'test',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 const req={kind,payload:{page:'A'.repeat(32),filters:{salaryMin:'10',salaryMax:'50'}}};
 authorizeTask(file,{allowedKinds:[kind],allowedRequests:[req],maxOperations:1,confirmedAt:now,scope:'test'});
 await executeScopedOperation(file,{...req,operationId:'partial'},async()=>({status:'unknown',evidence:{reason:'second field failed'}}));
 const scopeOp=readTask(scope).operations[0].operationId;
 for(const [f,id] of [[scope,scopeOp],[file,'partial']]){
  resolveOperation(f,{operationId:id,outcome:'abandoned',reviewer:'test',reviewedAt:now,executorStopped:true,evidence:{reason:'partial effects inspected'}});
  resumeTask(f,{reviewer:'test',confirmedAt:now,reason:'checked'});
 }
 const auth={previousOperationId:'partial',operationId:'reapply',reviewer:'test',confirmedAt:now,reason:'reapply complete range after review',prepareReadback:{url:'https://h.liepin.com/search/getConditionItem#session',observedAt:now,values:{salaryMin:'10',salaryMax:''}}};
 assert.throws(()=>authorizeScopedRetry(file,{...auth,prepareReadback:{...auth.prepareReadback,observedAt:'2000-01-01'}}),/五分钟/);
 assert.throws(()=>authorizeScopedRetry(file,{...auth,prepareReadback:undefined}));
 if(kind!=='prepare'){assert.throws(()=>authorizeScopedRetry(file,auth));return;}
 authorizeScopedRetry(file,auth);
 let calls=0;const invoke=()=>executeScopedOperation(file,{...req,operationId:'reapply'},async()=>{calls++;return {status:'completed',evidence:{applied:true}};});
 await invoke();await invoke();assert.equal(calls,1);
 assert.equal(readTask(file).operations[0].resolution.outcome,'abandoned');
 assert.deepEqual(readTask(file).retryAuthorizations[0].prepareReadback.values,auth.prepareReadback.values);
});

for(const scenario of ['valid','changed-filters','forged-original','abandoned','unknown','wrong-kind'])test(`restoration target replacement: ${scenario}`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-retarget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'test',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 const req={kind:scenario==='wrong-kind'?'prepare':'restore-search',payload:{page:'A'.repeat(32),roundId:'round',filters:{keyword:'embedded'},recoveryOf:'search'}};
 authorizeTask(file,{allowedKinds:[req.kind],allowedRequests:[req],maxOperations:1,confirmedAt:now,scope:'test'});
 await executeScopedOperation(file,{...req,operationId:'old'},async()=>({status:'failed',evidence:{businessActionStarted:false}}));
 if(scenario!=='unknown')for(const [f,id] of [[scope,readTask(scope).operations[0].operationId],[file,'old']]){
  resolveOperation(f,{operationId:id,outcome:scenario==='abandoned'?'abandoned':'not-executed',reviewer:'test',reviewedAt:now,executorStopped:true,evidence:{reason:'preflight only'}});
  resumeTask(f,{reviewer:'test',confirmedAt:now,reason:'checked'});
 }
 const previousRequest=structuredClone(req),replacementRequest=structuredClone(req);replacementRequest.payload.page='B'.repeat(32);
 if(scenario==='changed-filters')replacementRequest.payload.filters.keyword='changed';
 if(scenario==='forged-original')previousRequest.payload.page='C'.repeat(32);
 const auth={previousOperationId:'old',operationId:'retry',reviewer:'test',confirmedAt:now,reason:'observed replacement search tab',previousRequest,replacementRequest};
 if(scenario!=='valid'){
  const before=[fs.readFileSync(file,'utf8'),fs.readFileSync(scope,'utf8')];
  assert.throws(()=>authorizeScopedRetry(file,auth));
  assert.deepEqual([fs.readFileSync(file,'utf8'),fs.readFileSync(scope,'utf8')],before);return;
 }
 authorizeScopedRetry(file,auth);
 let calls=0;const invoke=()=>executeScopedOperation(file,{...replacementRequest,operationId:'retry'},async()=>{calls++;return {status:'completed',evidence:{restored:true}};});
 await invoke();await invoke();assert.equal(calls,1);
 for(const f of [file,scope]){
  const state=readTask(f);assert.equal(state.operations.length,2);assert.equal(state.operations[0].resolution.outcome,'not-executed');
  assert.deepEqual(state.retryAuthorizations[0].transportRetarget,{from:req.payload.page,to:replacementRequest.payload.page});
 }
});

for(const extension of ['absent','authorized','exhausted'])test(`scope retry ceiling: ${extension}`,async t=>{
 const {updateTask}=await import('../lib/task-store.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-ceiling-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'test',maxOperations:100,confirmedAt:now});bindSiteScope(file,scope);
 const req={kind:'favorite',payload:{resumeId:'synthetic'}};
 authorizeTask(file,{allowedKinds:['favorite'],allowedRequests:[req],maxOperations:1,confirmedAt:now,scope:'test'});
 await executeScopedOperation(file,{...req,operationId:'old'},async()=>({status:'blocked',evidence:{reason:'before save'}}));
 for(const [f,id] of [[scope,readTask(scope).operations[0].operationId],[file,'old']]){
  resolveOperation(f,{operationId:id,outcome:'not-executed',reviewer:'test',reviewedAt:now,executorStopped:true,evidence:{saved:false}});
  resumeTask(f,{reviewer:'test',confirmedAt:now,reason:'checked'});
 }
 if(extension!=='absent')updateTask(scope,s=>{s.requirements.budgetExtension={limit:120,reviewer:'user',reason:'explicit extension',confirmedAt:now};if(extension==='exhausted')s.requirements.maxOperations=120;return s;});
 const input={previousOperationId:'old',operationId:'retry',reviewer:'test',confirmedAt:now,reason:'checked'};
 if(extension!=='authorized'){assert.throws(()=>authorizeScopedRetry(file,input),/预算/);return;}
 authorizeScopedRetry(file,input);const state=readTask(scope);
 assert.equal(state.requirements.maxOperations,101);assert.equal(state.operations.length,1);assert.equal(state.operations[0].resolution.outcome,'not-executed');
});
