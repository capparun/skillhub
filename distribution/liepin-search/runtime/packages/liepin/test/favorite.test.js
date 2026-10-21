import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createTask,readTask,updateTask} from '../lib/task-store.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
import {authorizeTask} from '../lib/operation-gate.js';
import {setFavorite} from '../lib/favorite.js';
function fixture(t,action='add') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-fav-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString();
 const args={file,action,resumeId:'synthetic',page:'A'.repeat(32),operationId:'favorite-one',...(action==='add'?{group:'未分组'}:{})};
 createTask(file);createSiteScope(scope,{label:'test',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 const kind=action==='add'?'favorite':'unfavorite',payload={resumeId:args.resumeId,page:args.page,action,...(action==='add'?{group:args.group}:{})};
 authorizeTask(file,{allowedKinds:[kind],maxOperations:1,confirmedAt:now,scope:'测试指定收藏操作',allowedRequests:[{kind,payload}]});return args;
}
function driver(states){let i=0;const clicks=[];const labels=[];let closed=0;return {clicks,labels,get closed(){return closed;},options:{pause:async()=>{},openDriver:async()=>({inspect:async()=>({known:true,blocked:false,...states[Math.min(i++,states.length-1)]}),click:async (s,label)=>{assert.ok(s);clicks.push(s);labels.push(label);},close:async()=>{closed++;}})}};}
test('favorite selects group and saves exactly once, then reuses result',async t=>{
 const args=fixture(t),d=driver([{saved:false,button:'#favorite'},{saved:false,addDialog:true,groupSelector:'#group'},{saved:false,addDialog:true,groupSelected:true,save:'#save'},{saved:true}]);
 assert.equal((await setFavorite(args,d.options)).saved,true);await setFavorite(args,d.options);
 assert.deepEqual(d.clicks,['#favorite','#group','#save']);assert.deepEqual(d.labels,['收藏','指定收藏分组','保存收藏']);assert.equal(d.closed,1);
});
test('unfavorite confirms once and verifies the restored state',async t=>{
 const args=fixture(t,'remove'),d=driver([{saved:true,button:'#saved'},{saved:true,removeDialog:true,confirm:'#confirm'},{saved:false}]);
 assert.equal((await setFavorite(args,d.options)).saved,false);assert.deepEqual(d.clicks,['#saved','#confirm']);assert.deepEqual(d.labels,['已收藏','确认取消收藏']);
});
test('already desired state is a verified no-op',async t=>{
 const args=fixture(t),d=driver([{saved:true}]);assert.equal((await setFavorite(args,d.options)).changed,false);assert.equal(d.clicks.length,0);
});
test('missing group pauses without clicking save or retrying',async t=>{
 const args=fixture(t),d=driver([{saved:false,button:'#favorite'},{saved:false,addDialog:true}]);
 const result=await setFavorite(args,d.options);assert.equal(result.reason,'favorite_group_not_found');assert.deepEqual(d.clicks,['#favorite']);assert.equal(readTask(args.file).status,'paused');await assert.rejects(setFavorite(args,d.options));
});
test('favorite waits for asynchronously loaded groups before selecting and saving',async t=>{
 const args=fixture(t),d=driver([{saved:false,button:'#favorite'},
  {saved:false,addDialog:true},{saved:false,addDialog:true,groupSelector:'#group'},
  {saved:false,addDialog:true,groupSelected:true,save:'#save'},{saved:true}]);
 assert.equal((await setFavorite(args,d.options)).saved,true);
 assert.deepEqual(d.clicks,['#favorite','#group','#save']);
});
test('already open add dialog is reused without toggling it closed',async t=>{
 const args=fixture(t),d=driver([{saved:false,addDialog:true,button:'#favorite'},
  {saved:false,addDialog:true,groupSelector:'#group'},
  {saved:false,addDialog:true,groupSelected:true,save:'#save'},{saved:true}]);
 assert.equal((await setFavorite(args,d.options)).saved,true);
 assert.deepEqual(d.clicks,['#group','#save']);
});
test('new detail waits for recognizable favorite UI without another navigation or duplicate click',async t=>{
 const args=fixture(t),d=driver([{known:false},{known:false},{saved:false,button:'#favorite'},{saved:false,addDialog:true,groupSelector:'#group'},{saved:false,addDialog:true,groupSelected:true,save:'#save'},{saved:true}]);
 const result=await setFavorite(args,d.options);assert.equal(result.saved,true);assert.deepEqual(d.clicks,['#favorite','#group','#save']);
});
test('unrecognized detail times out before any click with explicit not-dispatched evidence',async t=>{
 const args=fixture(t),d=driver([{known:false}]);const result=await setFavorite(args,d.options);
 assert.equal(result.favoriteActionDispatched,false);assert.equal(result.reason,'favorite_preflight_unavailable');assert.equal(readTask(args.file).operations[0].status,'blocked');assert.equal(d.clicks.length,0);
});
test('waits for radio selection and enabled save after one group click',async t=>{
 const args=fixture(t),d=driver([{saved:false,button:'#favorite'},{saved:false,addDialog:true,groupSelector:'#group'},{saved:false,addDialog:true,groupSelected:false},{saved:false,addDialog:true,groupSelected:true},{saved:false,addDialog:true,groupSelected:true,save:'#save'},{saved:true}]);
 const r=await setFavorite(args,d.options);assert.equal(r.groupVerified,false);assert.equal(r.groupSelectedBeforeSave,true);assert.deepEqual(d.clicks,['#favorite','#group','#save']);
});

test('historical group absence does not reject a group now present in the live dialog',async t=>{
 const args=fixture(t);
 updateTask(args.file,task=>{task.policy.maxOperations=2;task.operations=[{operationId:'old-groups',kind:'inspect',status:'completed',finishedAt:'2026-01-01T00:00:00Z',evidence:{availableGroups:['过期的其他分组']}}];return task;});
 const d=driver([{saved:false,button:'#favorite'},{saved:false,addDialog:true,groups:['未分组'],groupSelector:'#group'},{saved:false,addDialog:true,groups:['未分组'],groupSelected:true,save:'#save'},{saved:true}]);
 const result=await setFavorite(args,d.options);
 assert.equal(result.saved,true);assert.deepEqual(d.clicks,['#favorite','#group','#save']);
});
test('unselected live group never submits save after bounded selection attempts',async t=>{
 const args=fixture(t),d=driver([{saved:false,button:'#favorite'},{saved:false,addDialog:true,groups:['未分组'],groupSelector:'#group',groupSelected:false}]);
 const result=await setFavorite(args,d.options);
 assert.equal(result.reason,'favorite_group_not_selected');assert.equal(d.clicks.includes('#save'),false);assert.ok(d.clicks.length<=3);
});
