import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope,executeScopedOperation} from '../lib/site-scope.js';
import {BlankPageError} from '../lib/page-failure.js';

function fixture(t,maxOperations=3) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-site-scope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const scope=path.join(dir,'scope.json'),confirmedAt=new Date().toISOString();
 createSiteScope(scope,{label:'合成账号',maxOperations,confirmedAt});
 const task=(name,resumeId,page='A'.repeat(32))=>{
  const file=path.join(dir,name+'.json'),request={operationId:'read',kind:'detail',payload:{resumeId,page}};createTask(file);bindSiteScope(file,scope);
  authorizeTask(file,{allowedKinds:['detail'],maxOperations:1,confirmedAt,scope:'合成单次详情',allowedRequests:[request]});return {file,request};
 };
 return {scope,task};
}
const success=async()=>({status:'completed',evidence:{read:true}});
test('blank navigation retains a sanitized diagnosis in both ledgers without clearing unknown effects',async t=>{
 const {scope,task}=fixture(t),one=task('one','a'),two=task('two','b');
 await assert.rejects(executeScopedOperation(one.file,one.request,async()=>{throw new BlankPageError('private data must not persist');}));
 for(const file of [one.file,scope]) {
  const saved=readTask(file);assert.equal(saved.status,'paused');assert.equal(saved.operations[0].status,'unknown');
  assert.deepEqual(saved.operations[0].evidence.connectionFailure,{code:'LIEPIN_UNEXPECTED_BLANK_PAGE',observedUrl:'about:blank',causeConfirmed:false,automaticRetry:false});
  assert.ok(!JSON.stringify(saved).includes('private data must not persist'));
 }
 await assert.rejects(executeScopedOperation(two.file,two.request,async()=>assert.fail('must not replay')),/暂停/);
});
test('two tasks share persistent concurrency control; a rejected task never calls its driver',async t=>{
 const {scope,task}=fixture(t),one=task('one','a'),two=task('two','b');let release,calls=0;
 const pending=executeScopedOperation(one.file,one.request,async()=>{calls++;await new Promise(resolve=>{release=resolve;});return success();});
 assert.equal(readTask(scope).operations[0].status,'started');
 await assert.rejects(executeScopedOperation(two.file,two.request,async()=>{calls++;return success();}),/未确认操作/);
 assert.equal(calls,1);assert.equal(readTask(two.file).operations[0].evidence.browserStarted,false);
 release();await pending;assert.equal(readTask(scope).operations[0].status,'completed');
});
test('new task or different page does not reset budget or repeat the same candidate read',async t=>{
 const {scope,task}=fixture(t),one=task('one','a'),two=task('two','a','B'.repeat(32));let calls=0;
 await executeScopedOperation(one.file,one.request,async()=>{calls++;return success();});
 await executeScopedOperation(one.file,one.request,async()=>{calls++;return success();});
 await assert.rejects(executeScopedOperation(two.file,two.request,async()=>{calls++;return success();}),/相同业务请求/);
 assert.equal(calls,1);assert.equal(readTask(scope).operations.length,1);
 const limited=fixture(t,1),a=limited.task('a','a'),b=limited.task('b','b');
 await executeScopedOperation(a.file,a.request,success);
 await assert.rejects(executeScopedOperation(b.file,b.request,async()=>assert.fail('budget bypass')),/预算/);
});
test('unknown, captcha, login and rate-limit outcomes pause every task in the bound scope',async t=>{
 for(const reason of ['disconnect','captcha','login_required','http_429']){
  const {scope,task}=fixture(t),one=task('one','a'),two=task('two','b');
  await executeScopedOperation(one.file,one.request,async()=>{
   if(reason==='disconnect')throw new Error('lost after dispatch');
   return {status:'blocked',evidence:{reason}};
  }).catch(()=>{});
  assert.equal(readTask(scope).status,'paused');
  await assert.rejects(executeScopedOperation(two.file,two.request,async()=>assert.fail('must not call browser')),/暂停/);
 }
});
test('replacing or rebinding a scope cannot silently reset prior authorization',async t=>{
 const {scope,task}=fixture(t),one=task('one','a');
 assert.throws(()=>bindSiteScope(one.file,scope),/不能切换/);
 const changed=readTask(scope);changed.id='replacement';fs.writeFileSync(scope,JSON.stringify(changed));
 await assert.rejects(executeScopedOperation(one.file,one.request,async()=>assert.fail('must not run')),/被替换/);
 assert.equal(readTask(one.file).operations.length,0);
});
test('native failure retains action geometry while the task and scope remain paused',async t=>{
 const {ActionStoppedError}=await import('../lib/native-actions.js');const {scope,task}=fixture(t),one=task('one','a');
 const error=new ActionStoppedError('target_covered','not_started');error.action={actionId:'input-1',purpose:'click',outcome:'not_started',acknowledgedActions:2};error.geometry={x:10,y:20,hitTag:'DIV',hitClass:'sticky-bar'};
 await assert.rejects(executeScopedOperation(one.file,one.request,async()=>{throw error;}));
 const stored=readTask(one.file);assert.equal(stored.status,'paused');assert.equal(readTask(scope).status,'paused');assert.deepEqual(stored.operations[0].evidence.actionFailure.geometry,error.geometry);assert.equal(stored.operations[0].evidence.actionFailure.action.acknowledgedActions,2);
});
test('favorite-open is separate from collection but cannot be replayed by changing page or purpose',async t=>{
 const {scope}=fixture(t,4),dir=path.dirname(scope),now=new Date().toISOString();
 const make=(name,kind,page,purpose)=>{const file=path.join(dir,name+'.json'),request={operationId:name,kind,payload:{observationId:'same',observationHash:'hash',page,purpose,...(kind==='favorite-open'?{favoriteOperationId:'one-write'}:{})}};createTask(file);bindSiteScope(file,scope);authorizeTask(file,{allowedKinds:[kind],maxOperations:1,confirmedAt:now,scope:'合成收藏访问',allowedRequests:[request]});return {file,request};};
 const read=make('read-list','detail-open','1','collect'),favorite=make('favorite-list','favorite-open','1','favorite'),replay=make('replay','favorite-open','2','new-purpose');let calls=0;
 await executeScopedOperation(read.file,read.request,async()=>{calls++;return success();});
 await executeScopedOperation(favorite.file,favorite.request,async()=>{calls++;return success();});
 await assert.rejects(executeScopedOperation(replay.file,replay.request,async()=>assert.fail('must not replay')),/相同业务请求/);assert.equal(calls,2);
});
