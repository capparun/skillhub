import test from 'node:test';import assert from 'node:assert/strict';
import {reviewVisibleDetail,reviewListTarget} from '../lib/visible-reading.mjs';
function fixture(){let y=0;const actions=[];return {actions,tab:{url:async()=>assert.fail('fixed observer validates the document without a second metadata call'),evaluate:async()=>({status:'ready',characters:400,y,height:1300,viewport:600,atEnd:y>=700}),act:async a=>{actions.push(a);y+=a.direction==='down'?a.amount:-a.amount;}}};}
test('content checks scroll with overlap to the end without artificial dwell or metadata calls',async()=>{const f=fixture(),waits=[];const r=await reviewVisibleDetail(f.tab,'abc',{pause:async ms=>waits.push(ms)});assert.equal(r.atEnd,true);assert.equal(r.views.length,3);assert.equal(r.observations,3);assert.equal(r.fixedWaitMs,0);assert.equal(r.scrolls,2);assert.deepEqual(waits,[]);assert.deepEqual(f.actions.map(a=>a.direction),['down','down']);});
test('short page is checked without unnecessary scrolling',async()=>{const f=fixture();f.tab.evaluate=async()=>({status:'ready',characters:80,y:0,height:300,viewport:600,atEnd:true});const r=await reviewVisibleDetail(f.tab,'abc');assert.equal(r.views.length,1);assert.equal(f.actions.length,0);});
test('cancellation after a viewport observation prevents the next scroll',async()=>{const f=fixture(),controller=new AbortController();await assert.rejects(reviewVisibleDetail(f.tab,'abc',{signal:controller.signal,onAction:e=>{if(e.phase==='reading')controller.abort();}}),/取消/);assert.equal(f.actions.length,0);});
test('blocked viewport stops before scrolling',async()=>{const f=fixture();f.tab.evaluate=async()=>({status:'risk_signal'});await assert.rejects(reviewVisibleDetail(f.tab,'abc'),/risk_signal/);assert.equal(f.actions.length,0);});
test('list checks scroll only until the target is visible without fixed waits',async()=>{
 let reads=0;const actions=[],waits=[];
 const tab={url:async()=>assert.fail('no duplicate metadata read'),evaluate:async()=>({status:'ready',top:++reads===1?800:200,bottom:1000,viewport:600,characters:240,inView:reads>1}),act:async a=>actions.push(a)};
 const result=await reviewListTarget(tab,'.card',{pause:async ms=>waits.push(ms)});assert.equal(result.scrolls,1);assert.equal(result.fixedWaitMs,0);assert.equal(actions.length,1);assert.equal(actions[0].direction,'down');assert.deepEqual(waits,[]);
});
test('list cancellation after card observation never opens or scrolls',async()=>{
 const controller=new AbortController();let acts=0;
 const tab={evaluate:async()=>{controller.abort();return {status:'ready',top:20,bottom:200,viewport:600,characters:100,inView:true};},act:async()=>acts++};
 await assert.rejects(reviewListTarget(tab,'.card',{signal:controller.signal}),/取消/);assert.equal(acts,0);
});
test('long detail reports incomplete viewport coverage instead of claiming full reading',async()=>{
 const f=fixture();let y=0;f.tab.evaluate=async()=>({status:'ready',characters:800,y,height:10000,viewport:600,atEnd:false});f.tab.act=async a=>{y+=a.amount;};
 const result=await reviewVisibleDetail(f.tab,'abc');assert.equal(result.atEnd,false);assert.equal(result.reason,'view_limit');assert.equal(result.views.length,3);assert.equal(result.fixedWaitMs,0);
});
test('failed scroll does not proceed to another screen or another scroll',async()=>{
 const f=fixture();f.tab.act=async a=>f.actions.push(a);await assert.rejects(reviewVisibleDetail(f.tab,'abc'),/滚动未确认/);assert.equal(f.actions.length,1);
});
test('single viewport observer rejects changed pages and duplicate identities before reading content',async t=>{
 const {inspectReadingViewport}=await import('../lib/visible-reading.mjs');const previous=Object.getOwnPropertyDescriptor(globalThis,'location');t.after(()=>{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;});
 for(const address of ['https://example.com/resume/showresumedetail/?res_id_encode=abc','https://h.liepin.com/search/getConditionItem?res_id_encode=abc','https://h.liepin.com/resume/showresumedetail/?res_id_encode=other','https://h.liepin.com/resume/showresumedetail/?res_id_encode=abc&res_id_encode=abc']){
  Object.defineProperty(globalThis,'location',{value:new URL(address),configurable:true});assert.deepEqual(inspectReadingViewport({resumeId:'abc'}),{status:'page_changed'});
 }
});
