import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,readTask,updateTask,mergeListResults,mergeObservations} from '../lib/task-store.js';
import {linkListObservation} from '../lib/identity-link.js';
import {taskSummary,renderReport} from '../lib/report.js';
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-link-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);
 updateTask(file,t=>mergeListResults(t,[{source:'liepin',name:'匿名',text:'合成列表'}],{roundId:'trial'}));
 updateTask(file,t=>mergeObservations(t,[{source:'liepin',resumeId:'one',status:'partial',text:'合成详情'}],{stage:'detail',roundId:'detail'}));
 const task=readTask(file);
 return {file,args:{observationId:task.unlinkedObservations[0].id,candidateKey:'liepin:one',detailHash:task.candidates[0].observations[0].hash,reviewedBy:'reviewer',reviewedAt:new Date().toISOString(),reason:'人工核对所打开详情与列表卡片对应'}};
}
test('confirmed linkage preserves originals and removes double counting in reports',t=>{
 const {file,args}=fixture(t);const original=readTask(file).unlinkedObservations[0];
 linkListObservation(file,args);linkListObservation(file,args);
 const task=readTask(file);
 assert.equal(task.candidates[0].observations.length,2);
 assert.deepEqual(task.unlinkedObservations[0].data,original.data);
 assert.equal(task.candidates[0].observations[1].hash,original.hash);
 assert.equal(taskSummary(task).unresolvedIdentities,0);
 assert.equal(task.events.filter(e=>e.type==='list_identity_linked').length,1);
 assert.equal(renderReport(task,'csv').includes('未识别记录:'),false);
 assert.equal(renderReport(task,'json').includes('human-confirmed'),true);
});
test('cannot link without a readable saved detail or overwrite a confirmed identity',t=>{
 const {file,args}=fixture(t);
 assert.throws(()=>linkListObservation(file,{...args,detailHash:'missing'}),/详情快照/);
 assert.throws(()=>linkListObservation(file,{...args,reviewedBy:''}),/复核人/);
 linkListObservation(file,args);
 updateTask(file,t=>mergeObservations(t,[{source:'liepin',resumeId:'two',status:'readable',text:'不同详情'}],{stage:'detail',roundId:'detail2'}));
 const second=readTask(file).candidates[1];
 assert.throws(()=>linkListObservation(file,{...args,candidateKey:second.key,detailHash:second.observations[0].hash}),/不能覆盖/);
});
