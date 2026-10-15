import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundLocation} from '../lib/bound-page.js';
const id='A'.repeat(32),url='https://h.liepin.com/search/getConditionItem#session';
test('missing, blank or wrong binding never executes browser page code',async()=>{
 for(const tabs of [[],[{page:id,url:'about:blank'}],[{page:'B'.repeat(32),url}]]) {
  await assert.rejects(readBoundLocation({tabs:async()=>tabs,evaluate:async()=>assert.fail('must not execute')},id,'/search/getConditionItem'));
 }
});
test('binding must retain its exact observed URL during the read',async()=>{
 const page={tabs:async()=>[{page:id,url}],evaluate:async()=>({url})};
 assert.equal(await readBoundLocation(page,id,'/search/getConditionItem'),url);
 page.evaluate=async()=>({url:'about:blank'});
 await assert.rejects(readBoundLocation(page,id,'/search/getConditionItem'),/读取期间/);
});
test('task connection requires bridge capability before evaluating a page',async()=>{
 let reads=0;
 const tab={page:id,url};
 const page={tabs:async()=>[tab],evaluate:async()=>{reads++;return {url};}};
 for(const mode of ['hunter-mainframe-v1','other-mode']) {
  tab.connectionMode=mode;
  await assert.rejects(readBoundLocation(page,id,'/search/getConditionItem',{requireConnection:true}),/连接协议未匹配/);
 }
 assert.equal(reads,0);
 delete tab.connectionMode;
 assert.equal(await readBoundLocation(page,id,'/search/getConditionItem',{requireConnection:true}),url);
 assert.equal(reads,1);
});
test('wrong binding diagnostics omit query strings, fragments, credentials and private paths',async()=>{
 for(const wrong of ['https://h.liepin.com/resume/showresumedetail/?res_id_encode=private-id&token=secret#private','https://name:password@example.com/private-user-path?token=secret','file:///private/home/user/private-report']){
  await assert.rejects(readBoundLocation({tabs:async()=>[{page:id,url:wrong}],evaluate:async()=>assert.fail('must not evaluate')},id,'/search/getConditionItem'),error=>{
   for(const sensitive of ['private-id','secret','password','private-user-path','private-report'])assert.ok(!error.message.includes(sensitive));
   return true;
  });
 }
});
