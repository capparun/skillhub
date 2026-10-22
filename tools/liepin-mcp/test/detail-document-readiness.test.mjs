import test from 'node:test';import assert from 'node:assert/strict';
import {waitForCommittedDetailUrl} from '../lib/detail-driver.mjs';
const url='https://h.liepin.com/resume/showresumedetail/?res_id_encode=sample';
const loading=(id='2',pending=url)=>Error(`tab ${id} has no committed document (status loading, pending ${pending})`);
test('a created loading detail is read from the same child after commit without another click',async()=>{
 let reads=0,waits=0,time=0,logs=0;const child={id:'2',url:async()=>{if(++reads<3)throw loading();return url;}};
 assert.equal(await waitForCommittedDetailUrl(child,{timeoutMs:100,pollMs:10,now:()=>time,pause:async ms=>{time+=ms;waits++;},onWaiting:()=>logs++}),url);
 assert.equal(reads,3);assert.equal(waits,2);assert.equal(logs,1);
});
test('loading wait is bounded and does not claim a document was read',async()=>{
 let time=0,reads=0;await assert.rejects(waitForCommittedDetailUrl({id:'2',url:async()=>{reads++;throw loading();}},{timeoutMs:20,pollMs:10,now:()=>time,pause:async ms=>{time+=ms;}}),e=>e.code==='DETAIL_DOCUMENT_NOT_READY'&&e.childId==='2');assert.equal(reads,2);assert.equal(time,20);
});
test('wrong child, other origins, other paths and ordinary errors are never treated as loading',async()=>{
 for(const error of [loading('3'),loading('2','https://other.example/resume/showresumedetail/?res_id_encode=x'),loading('2','https://h.liepin.com/search/getConditionItem'),Error('permission denied')]){
  let waits=0;await assert.rejects(waitForCommittedDetailUrl({id:'2',url:async()=>{throw error;}},{pause:async()=>{waits++;}}),e=>e===error);assert.equal(waits,0);
 }
});
test('cancellation after a loading response stops before another document access',async()=>{
 let reads=0,cancelled=false;await assert.rejects(waitForCommittedDetailUrl({id:'2',url:async()=>{reads++;throw loading();}},{check:()=>{if(cancelled)throw Error('cancelled');},pause:async()=>{cancelled=true;}}),/cancelled/);assert.equal(reads,1);
});

test('a document call that never returns times out without a second access',async()=>{
 let reads=0;await assert.rejects(waitForCommittedDetailUrl({id:'2',url:()=>{reads++;return new Promise(()=>{});}},{timeoutMs:5}),e=>e.code==='STEP_TIMEOUT');assert.equal(reads,1);
});
