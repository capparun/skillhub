import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask} from '../lib/operation-gate.js';
import {readCurrentDetail} from '../lib/current-detail.js';
import {detailUrl} from '../lib/detail.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
const page='A'.repeat(32), resumeId='synthetic';
function fixture(t,authorized=true) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-current-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);
 const scopeFile=path.join(dir,'scope.json');createSiteScope(scopeFile,{label:'合成账号范围',maxOperations:1,confirmedAt:new Date().toISOString()});bindSiteScope(file,scopeFile);
 if(authorized)authorizeTask(file,{allowedKinds:['detail'],maxOperations:1,confirmedAt:new Date().toISOString(),scope:'一份已打开的合成简历',allowedRequests:[{kind:'detail',payload:{page,resumeId}}]});
 return {file,page,resumeId,operationId:'read-one'};
}
test('detail validates explicit target and authorization before any browser call',async t=>{
 let calls=0;const options={openReader:async()=>{calls++;throw new Error('must not connect');}};
 const args=fixture(t,false);await assert.rejects(readCurrentDetail(args,options),/未授权/);
 await assert.rejects(readCurrentDetail({...args,page:'current'},options),/targetId/);
 assert.equal(calls,0);
});
test('current-page detail saves partial content and repeat reuses the exact snapshot',async t=>{
 const args=fixture(t);let calls=0;
 const options={openReader:async id=>{assert.equal(id,page);calls++;return {read:async()=>({url:detailUrl(resumeId),text:'工作经历\n合成职责\n项目经历（共5段）\n合成项目\n显示其他 3 段项目经历',readyState:'complete'})};}};
 const result=await readCurrentDetail(args,options);assert.equal(result.status,'partial');assert.equal(result.operationStatus,'completed');
 await readCurrentDetail(args,options);assert.equal(calls,1);assert.equal(readTask(args.file).candidates[0].observations.length,1);
});
test('wrong detail identity pauses without saving a different person as the requested one',async t=>{
 const args=fixture(t);const result=await readCurrentDetail(args,{openReader:async()=>({read:async()=>({url:detailUrl('another'),text:'工作经历\n不同人选',readyState:'complete'})})});
 assert.equal(result.status,'wrong_page');assert.equal(result.text,undefined);assert.equal(readTask(args.file).status,'paused');
 await assert.rejects(readCurrentDetail(args,{openReader:async()=>{assert.fail('must not reconnect');}}));
});
test('reader releases its session once on success and on a read exception',async t=>{
 for(const fail of [false,true]) {
  const args=fixture(t);let closed=0;
  const options={openReader:async()=>({close:async()=>{closed++;},read:async()=>{
   if(fail)throw new Error('lost connection');
   return {url:detailUrl(resumeId),text:'工作经历\n合成职责',readyState:'complete'};
  }})};
  if(fail)await assert.rejects(readCurrentDetail(args,options));
  else await readCurrentDetail(args,options);
  assert.equal(closed,1);
 }
});
