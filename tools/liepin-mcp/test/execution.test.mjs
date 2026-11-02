import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executeMcpOperation} from '../lib/execution.mjs';
import {createTask,readTask,updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-gate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const scope=path.join(dir,'scope.json'),confirmedAt=new Date().toISOString();
 createSiteScope(scope,{label:'合成账号',maxOperations:5,confirmedAt});
 const task=(name,resumeId)=>{const file=path.join(dir,name+'.json');createTask(file);bindSiteScope(file,scope);
 const request={operationId:'read',kind:'detail',payload:{resumeId,page:'synthetic'}};
 authorizeTask(file,{allowedKinds:['detail'],maxOperations:2,scope:'合成单条读取',confirmedAt,allowedRequests:[request]});return {file,request};};
 return {scope,task};
}
const completed=()=>({status:'completed',evidence:{read:true}});
test('MCP calls share the original durable ledger and completed result cache',async t=>{
 const {scope,task}=fixture(t),a=task('a','one');let calls=0;
 await executeMcpOperation(a.file,a.request,async()=>{calls++;return completed();});
 await executeMcpOperation(a.file,a.request,()=>assert.fail('must not dispatch'));
 assert.equal(calls,1);assert.equal(readTask(scope).operations.length,1);assert.equal(readTask(a.file).operations[0].status,'completed');assert.equal(readTask(a.file).mcpOperations,undefined);
});
test('cross-task concurrent operations cannot dispatch together',async t=>{
 const {task}=fixture(t),a=task('a','one'),b=task('b','two');let release;
 const first=executeMcpOperation(a.file,a.request,()=>new Promise(r=>release=()=>r(completed())));
 await assert.rejects(executeMcpOperation(b.file,b.request,()=>assert.fail('must not dispatch')),/未确认/);
 release();await first;
});
test('cancellation after dispatch retains unknown and blocks other tasks',async t=>{
 const {scope,task}=fixture(t),a=task('a','one'),b=task('b','two'),controller=new AbortController();
 await assert.rejects(executeMcpOperation(a.file,a.request,async()=>{controller.abort();return completed();},{signal:controller.signal}),/取消/);
 assert.equal(readTask(scope).operations[0].status,'unknown');
 await assert.rejects(executeMcpOperation(b.file,b.request,()=>assert.fail('must not dispatch')),/暂停/);
});
test('already cancelled calls do not reserve a budget or dispatch',async t=>{
 const {scope,task}=fixture(t),a=task('a','one');
 await assert.rejects(executeMcpOperation(a.file,a.request,()=>assert.fail(),{signal:AbortSignal.abort()}),/取消/);
 assert.equal((readTask(scope).operations??[]).length,0);
});
test('old alpha journals cannot bypass scope by being silently migrated',async t=>{
 const {task}=fixture(t),a=task('a','one');updateTask(a.file,x=>({...x,mcpOperations:[{status:'unknown'}]}));
 await assert.rejects(executeMcpOperation(a.file,a.request,()=>assert.fail()),/旧 MCP/);
});
test('a delivered click alone never counts as business completion',async t=>{
 const {scope,task}=fixture(t),a=task('a','one');
 await assert.rejects(executeMcpOperation(a.file,a.request,()=>({delivery:'received'})),/证据/);
 assert.equal(readTask(scope).operations[0].status,'unknown');
});

test('search rejects an unapproved round before connecting to Chrome',async t=>{
 const {task}=fixture(t),a=task('unapproved','one');updateTask(a.file,x=>({...x,rounds:[{id:'trial',status:'planned',phase:'trial',filters:{keyword:'合成'}}]}));
 const {search}=await import('../lib/workflow.mjs');
 await assert.rejects(search({verify:()=>assert.fail('must not connect')},{file:a.file,round_id:'trial',tab_id:'1'}),/授权/);
});
