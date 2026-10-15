import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask,beginOperation,executeOperation} from '../lib/operation-gate.js';
function fixture(t,maxOperations=2) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-gate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file);
 authorizeTask(file,{allowedKinds:['detail'],maxOperations,confirmedAt:new Date().toISOString(),scope:'合成测试的两条简历',allowedRequests:[request]});return file;
}
const request={operationId:'detail-1',kind:'detail',payload:{resumeId:'synthetic'}};
test('same completed operation returns prior evidence, not a second navigation',async t=>{
 const file=fixture(t);let calls=0;const action=async()=>{calls++;return {status:'completed',evidence:{readable:true}};};
 await executeOperation(file,request,action);await executeOperation(file,request,action);assert.equal(calls,1);
 await assert.rejects(executeOperation(file,{...request,operationId:'renamed'},action),/相同请求/);assert.equal(calls,1);
});
test('disconnect after action remains unknown; a new call and different ID cannot retry',async t=>{
 const file=fixture(t);let calls=0;
 await assert.rejects(executeOperation(file,request,async()=>{calls++;throw new Error('context lost after navigation');}));
 await assert.rejects(executeOperation(file,{...request,operationId:'new-id'},async()=>{calls++;}));
 assert.equal(calls,1);assert.equal(readTask(file).status,'paused');assert.equal(readTask(file).operations[0].status,'unknown');
});
test('pending operation blocks concurrent or restarted callers',t=>{
 const file=fixture(t);beginOperation(file,request);
 assert.throws(()=>beginOperation(file,{...request,operationId:'another'}),/暂停|未确认/);
 assert.throws(()=>beginOperation(file,request),/未确认/);
});
test('scope and persistent budgets cannot be reset by later calls',async t=>{
 const file=fixture(t,1);await executeOperation(file,request,async()=>({status:'completed',evidence:{readable:true}}));
 assert.throws(()=>beginOperation(file,{...request,operationId:'second'}),/预算/);
 assert.throws(()=>beginOperation(file,{...request,kind:'favorite'}),/未授权/);
 assert.throws(()=>authorizeTask(file,{allowedKinds:['detail'],maxOperations:10,confirmedAt:new Date().toISOString(),scope:'reset',allowedRequests:[request]}),/重置/);
 assert.throws(()=>beginOperation(file,{...request,payload:{resumeId:'different'}}),/不同操作/);
});
test('captcha and non-business success pause the workflow',async t=>{
 for(const result of [{status:'blocked',evidence:{reason:'captcha'}},{delivered:true},{status:'completed'},{status:'completed',evidence:{}}]){
 const file=fixture(t);await executeOperation(file,request,async()=>result).catch(()=>{});assert.equal(readTask(file).status,'paused');
 }
});
