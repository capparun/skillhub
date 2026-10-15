import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,updateTask,readTask} from '../lib/task-store.js';
import {detailCleanupTargets,cleanupSavedDetails} from '../lib/tab-cleanup.js';
const parent='A'.repeat(32),child='B'.repeat(32);
function fixture(){
 const detail={resumeId:'synthetic',status:'partial',url:'https://h.liepin.com/resume/showresumedetail/?res_id_encode=synthetic'};
 return {operations:[{operationId:'one',kind:'detail-open',status:'completed',evidence:{parentPage:parent,detailPage:child,method:'observed-card-managed-tab',detail}}],
 candidates:[{key:'liepin:synthetic',observations:[{stage:'detail',roundId:'detail-one',data:detail}]}]};
}
test('cleanup requires persisted detail, parent provenance and managed popup ownership',()=>{
 const task=fixture();assert.equal(detailCleanupTargets(task,parent).length,1);
 for(const change of [t=>delete t.operations[0].evidence.parentPage,t=>t.operations[0].status='unknown',
  t=>t.operations[0].evidence.method='observed-card-foreground',t=>t.candidates=[],
  t=>t.operations[0].evidence.returnError='failed',t=>t.operations[0].evidence.detailPage=parent]){
  const copy=structuredClone(task);change(copy);assert.deepEqual(detailCleanupTargets(copy,parent),[]);
 }
});
test('only verified task target closes; changed and unrelated pages remain; repeated cleanup is idempotent',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-cleanup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);updateTask(file,t=>Object.assign(t,fixture()));
 const target=detailCleanupTargets(readTask(file),parent)[0],tabs=new Map([[child,{page:child,url:'https://example.com/user-page'}],['unrelated',{page:'unrelated'}]]);
 let closes=0;
 const driver={checkParent:async p=>assert.equal(p,parent),inspect:async p=>tabs.get(p),close:async p=>{closes++;tabs.delete(p);}};
 assert.equal((await cleanupSavedDetails({file,page:parent},{driver})).complete,false);assert.equal(closes,0);
 tabs.set(child,target);
 assert.equal((await cleanupSavedDetails({file,page:parent},{driver})).complete,true);
 assert.equal((await cleanupSavedDetails({file,page:parent},{driver})).complete,true);
 assert.equal(closes,1);assert.ok(tabs.has('unrelated'));
});
test('legacy details are reported as preserved, never mistaken for an empty successful cleanup',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-cleanup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);const task=fixture();delete task.operations[0].evidence.parentPage;
 updateTask(file,t=>Object.assign(t,task));
 const result=await cleanupSavedDetails({file,page:parent},{driver:{checkParent:async()=>{},close:async()=>assert.fail()}});
 assert.equal(result.complete,false);assert.equal(result.preserved.length,1);
});
