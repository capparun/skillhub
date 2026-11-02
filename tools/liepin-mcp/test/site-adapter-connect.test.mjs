import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {connectAdapterSearch} from '../lib/site-adapter-connect.mjs';
import {createTask,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
const url='https://h.liepin.com/search/getConditionItem';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-connect-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'task.json'),confirmedAt=new Date().toISOString();createTask(file);createSiteScope(file+'.scope',{label:'synthetic',maxOperations:1,confirmedAt});bindSiteScope(file,file+'.scope');authorizeTask(file,{allowedKinds:['inspect'],allowedRequests:[{kind:'inspect',payload:{view:'adapter-search-connect',url}}],maxOperations:1,scope:'synthetic',confirmedAt});return {file,operation_id:'connect-one'};}
test('official connect returns the post-navigation identity and never replays a completed operation',async t=>{
 const args=fixture(t);let count=0,id='adapter';const tab={get id(){return id;},goto:async target=>{assert.equal(target,url);count++;id='123';},url:async()=>url};
 const result=await connectAdapterSearch({args,tab});assert.equal(result.tabId,'123');assert.equal(result.verification,'url-only');
 await connectAdapterSearch({args,tab});assert.equal(count,1);
});
test('blank landing retains unknown and prevents repeated navigation',async t=>{
 const args=fixture(t);let count=0;const tab={id:'123',goto:async()=>{count++;},url:async()=> 'about:blank'};
 await assert.rejects(connectAdapterSearch({args,tab}),/页面地址/);assert.equal(readTask(args.file).operations[0].status,'unknown');
 await assert.rejects(connectAdapterSearch({args,tab}));assert.equal(count,1);
});
test('separate tasks may open their own search workspace without weakening same-task idempotency',async t=>{
 const a=fixture(t),scope=a.file+'.scope';
 const {updateTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');
 updateTask(scope,s=>{s.requirements.maxOperations=3;return s;});
 const file=a.file+'.second';createTask(file);bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['inspect'],allowedRequests:[{kind:'inspect',payload:{view:'adapter-search-connect',url}}],maxOperations:2,scope:'synthetic',confirmedAt:new Date().toISOString()});
 let calls=0;const tab={id:'123',goto:async()=>{calls++;},url:async()=>url};
 await connectAdapterSearch({args:a,tab});await connectAdapterSearch({args:{file,operation_id:'second'},tab});
 assert.equal(calls,2);assert.equal(readTask(scope).operations.length,2);
 await assert.rejects(connectAdapterSearch({args:{file,operation_id:'duplicate'},tab}),/相同请求/);assert.equal(calls,2);
});
test('reconciled pre-dispatch connect denial can retry without inventing a missing scope reservation',async t=>{
 const args=fixture(t),scope=args.file+'.scope';
 const {updateTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');
 const {resolveOperation,resumeTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
 const {authorizeScopedRetry}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
 updateTask(scope,s=>{s.requirements.maxOperations=1;s.operations=[{operationId:'other',status:'completed'}];return s;});
 let calls=0;const tab={id:'123',goto:async()=>{calls++;},url:async()=>url};
 await assert.rejects(connectAdapterSearch({args,tab}),/预算/);assert.equal(calls,0);
 const at=new Date().toISOString();resolveOperation(args.file,{operationId:args.operation_id,outcome:'not-executed',reviewer:'test',reviewedAt:at,executorStopped:true,evidence:{browserStarted:false}});
 resumeTask(args.file,{reviewer:'test',confirmedAt:at,reason:'verified zero dispatch'});
 const retry={previousOperationId:args.operation_id,operationId:'retry',reviewer:'test',confirmedAt:at,reason:'verified denial'};
 assert.throws(()=>authorizeScopedRetry(args.file,retry),/预算/);
 updateTask(scope,s=>{s.requirements.maxOperations=2;return s;});
 authorizeScopedRetry(args.file,retry);
 await connectAdapterSearch({args:{...args,operation_id:'retry'},tab});assert.equal(calls,1);assert.equal(readTask(scope).operations.length,2);
});
test('new search workspace preserves bound page and reuses completed creation receipt',async t=>{
 const args=fixture(t);const task=readTask(args.file);
 const {grantOperations}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
 grantOperations(args.file,{allowedRequests:[{kind:'inspect',payload:{view:'adapter-search-connect',url,newWorkspace:true}}],confirmedAt:new Date().toISOString(),scope:'create separate owned search workspace'});
 let opened=0;const context={args:{...args,new_workspace:true},tab:{id:'9',goto:async()=>assert.fail('parent must be preserved')},tabs:{openSearch:async()=>{opened++;return {id:'88',url:async()=>url};}}};
 assert.equal((await connectAdapterSearch(context)).tabId,'88');assert.equal((await connectAdapterSearch(context)).tabId,'88');assert.equal(opened,1);
});

async function replacementFixture(t,{authorize=true}={}){
 const args=fixture(t);
 const {grantOperations}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
 const {updateTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');
 updateTask(args.file+'.scope',s=>{s.requirements.maxOperations=10;return s;});
 const grant=payload=>grantOperations(args.file,{allowedRequests:[{kind:'inspect',payload}],confirmedAt:new Date().toISOString(),scope:'synthetic workspace replacement'});
 grant({view:'adapter-search-connect',url,newWorkspace:true});
 await connectAdapterSearch({args:{...args,new_workspace:true},tabs:{openSearch:async()=>({id:'88',url:async()=>url})}});
 const replacement={...args,operation_id:'replace-one',new_workspace:true,replaces_operation_id:args.operation_id};
 if(authorize)grant({view:'adapter-search-connect',url,newWorkspace:true,replacesOperationId:args.operation_id});
 return replacement;
}
test('closed owned workspace is replaced once without navigating a user page',async t=>{
 const args=await replacementFixture(t);let lookups=0,opens=0;
 const context={args,userTabs:{lookup:async id=>{lookups++;assert.equal(id,'88');return {tabId:id,exists:false,verification:'chrome-tabs-get-not-found'};}},tabs:{openSearch:async()=>{opens++;return {id:'99',url:async()=>url};}},tab:{goto:async()=>assert.fail('must preserve user page')}};
 const result=await connectAdapterSearch(context);assert.equal(result.tabId,'99');assert.equal(result.previousTabId,'88');
 await connectAdapterSearch(context);assert.equal(lookups,1);assert.equal(opens,1);
});
test('an existing previous workspace is never replaced',async t=>{
 const args=await replacementFixture(t);let opens=0;
 const result=await connectAdapterSearch({args,userTabs:{lookup:async id=>({tabId:id,exists:true,verification:'chrome-tabs-get'})},tabs:{openSearch:async()=>{opens++;}}});
 assert.equal(result.reason,'previous_workspace_still_exists');assert.equal(opens,0);
});
test('replacement requires an exact request grant before any metadata or navigation',async t=>{
 const args=await replacementFixture(t,{authorize:false});let calls=0;
 await assert.rejects(connectAdapterSearch({args,userTabs:{lookup:async()=>{calls++;}},tabs:{openSearch:async()=>{calls++;}}}));assert.equal(calls,0);
});
test('replacement rejects unknown or non-owned prior operations before browser access',async t=>{
 const args=await replacementFixture(t);let calls=0;
 for(const altered of [{replaces_operation_id:'missing'},{new_workspace:false}])await assert.rejects(connectAdapterSearch({args:{...args,...altered},userTabs:{lookup:async()=>{calls++;}}}),/只能替代/);
 const {updateTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');
 updateTask(args.file,s=>{s.operations[0].payload.newWorkspace=false;return s;});
 await assert.rejects(connectAdapterSearch({args,userTabs:{lookup:async()=>{calls++;}}}),/只能替代/);assert.equal(calls,0);
});
test('ambiguous metadata and connection failures never open a replacement',async t=>{
 for(const value of [null,{tabId:'other',exists:false,verification:'chrome-tabs-get-not-found'},{tabId:'88',exists:false,verification:'inventory-only'},Error('bridge disconnected')]){
  const args=await replacementFixture(t);let opens=0;
  try{await connectAdapterSearch({args,userTabs:{lookup:async()=>{if(value instanceof Error)throw value;return value;}},tabs:{openSearch:async()=>{opens++;}}});}catch{}
  assert.equal(opens,0);
 }
});
