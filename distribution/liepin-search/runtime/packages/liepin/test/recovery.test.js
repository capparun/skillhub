import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask,executeOperation,resolveOperation,resumeTask,finishOperation,beginOperation} from '../lib/operation-gate.js';

const request = {operationId:'first',kind:'favorite',payload:{resumeId:'synthetic'}};
const second = {operationId:'second',kind:'favorite',payload:{resumeId:'synthetic-2'}};
const now = () => new Date().toISOString();
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'liepin-recovery-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'task.json'); createTask(file);
  authorizeTask(file,{allowedKinds:['favorite'],allowedRequests:[request,second],maxOperations:2,confirmedAt:now(),scope:'合成样例两项收藏'});
  return file;
}
function resolution(outcome='completed') {return {operationId:'first',outcome,reviewer:'人工测试',reviewedAt:now(),executorStopped:true,evidence:{observed:'fixture-state'}};}
const resume = () => ({reviewer:'人工测试',confirmedAt:now(),reason:'已核对本地模拟执行结果'});
test('a lost response requires resolution and separate resume; budget and old outcome remain',async t=>{
  const file=fixture(t);let calls=0;
  await assert.rejects(executeOperation(file,request,async()=>{calls++;throw new Error('lost response after write');}));
  assert.throws(()=>resumeTask(file,resume()),/尚未核对/);
  assert.throws(()=>resolveOperation(file,{...resolution(),executorStopped:false}),/停止/);
  resolveOperation(file,resolution());
  assert.equal(readTask(file).status,'paused');
  assert.equal(readTask(file).operations[0].resolution.previous.status,'unknown');
  assert.throws(()=>beginOperation(file,second),/暂停/);
  await executeOperation(file,request,async()=>{calls++;});
  assert.equal(calls,1);
  resumeTask(file,resume());
  await executeOperation(file,second,async()=>{calls++;return {status:'completed',evidence:{confirmed:true}};});
  assert.equal(calls,2);assert.equal(readTask(file).operations.length,2);
});
test('confirmed not-executed keeps a tombstone; neither same nor renamed ID repeats it',t=>{
  const file=fixture(t);beginOperation(file,request);resolveOperation(file,resolution('not-executed'));resumeTask(file,resume());
  assert.throws(()=>beginOperation(file,request),/未确认|中止/);
  assert.throws(()=>beginOperation(file,{...request,operationId:'renamed'}),/相同请求/);
  assert.throws(()=>finishOperation(file,'first',{status:'completed',evidence:{late:true}}),/不能覆盖/);
  assert.equal(readTask(file).operations[0].status,'closed');
});
test('invalid executor evidence and non-Error exceptions become unknown, never a success',async t=>{
  for (const action of [async()=>({status:'completed',evidence:[]}),async()=>{throw null;}]) {
    const file=fixture(t);await assert.rejects(executeOperation(file,request,action));
    assert.equal(readTask(file).operations[0].status,'unknown');assert.equal(readTask(file).status,'paused');
  }
});
