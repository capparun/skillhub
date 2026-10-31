import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask,resolveOperation,resumeTask} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope,executeScopedOperation} from '../lib/site-scope.js';

test('terminated executor preserves both ledgers and cannot replay after restart', {timeout:15000}, async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-process-interruption-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'task.json'),scope=path.join(root,'scope.json'),marker=path.join(root,'dispatch.txt');
 const confirmedAt=new Date().toISOString(),request={operationId:'one',kind:'inspect',payload:{view:'synthetic'}};
 createTask(file);createSiteScope(scope,{label:'合成进程中断验收',maxOperations:3,confirmedAt});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['inspect'],maxOperations:2,confirmedAt,scope:'合成进程，不连接浏览器',allowedRequests:[request]});
 const moduleUrl=new URL('../lib/site-scope.js',import.meta.url).href;
 const code=`import fs from 'node:fs';import {executeScopedOperation} from ${JSON.stringify(moduleUrl)};await executeScopedOperation(${JSON.stringify(file)},${JSON.stringify(request)},async()=>{fs.writeFileSync(${JSON.stringify(marker)},'dispatched',{flag:'wx'});process.stdout.write('READY\\n');await new Promise(()=>{setInterval(()=>{},1000);});});`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 const exited=once(child,'exit');
 let text='';await new Promise((resolve,reject)=>{
  child.stdout.on('data',data=>{text+=data;if(text.includes('READY\n'))resolve();});
  child.once('error',reject);child.once('exit',()=>{if(!text.includes('READY\n'))reject(Error('child ended before reservation'));});
 });
 assert.equal(child.kill('SIGKILL'),true);const [exitCode,signal]=await exited;if(process.platform!=='win32')assert.equal(signal,'SIGKILL');else assert.notEqual(exitCode,0);
 for(const target of [file,scope])assert.equal(readTask(target).operations[0].status,'started');
 let replayed=false;
 await assert.rejects(executeScopedOperation(file,request,async()=>{replayed=true;}),/未确认|暂停/);
 assert.equal(replayed,false);assert.equal(fs.readFileSync(marker,'utf8'),'dispatched');
 assert.throws(()=>resumeTask(file,{reviewer:'synthetic',confirmedAt,reason:'process stopped'}),/未暂停|尚未核对/);
 // This synthetic effect is independently observed; never infer not-executed from death.
 for(const target of [scope,file]){
  const operationId=readTask(target).operations[0].operationId;
  resolveOperation(target,{operationId,outcome:'completed',reviewer:'synthetic-observer',reviewedAt:new Date().toISOString(),executorStopped:true,evidence:{markerObserved:true,scope:'synthetic-only'}});
  resumeTask(target,{reviewer:'synthetic-observer',confirmedAt:new Date().toISOString(),reason:'synthetic marker reconciled'});
 }
 const replay=await executeScopedOperation(file,request,async()=>{replayed=true;});
 assert.deepEqual(replay,{markerObserved:true,scope:'synthetic-only'});assert.equal(replayed,false);
 for(const target of [file,scope]){
  const saved=readTask(target);assert.equal(saved.operations.length,1);assert.equal(saved.operations[0].resolution.previous.status,'started');
 }
});
