import test from 'node:test';import assert from 'node:assert/strict';
import {reviewVisibleDetail} from '../lib/visible-reading.mjs';
function fixture(){let y=0;const actions=[];return {actions,tab:{url:async()=> 'https://h.liepin.com/resume/showresumedetail/?res_id_encode=abc',evaluate:async()=>({status:'ready',characters:400,y,height:1300,viewport:600,atEnd:y>=700}),act:async a=>{actions.push(a);y+=a.direction==='down'?a.amount:-a.amount;}}};}
test('content review pauses per visible screen and scrolls with overlap to the end',async()=>{const f=fixture(),waits=[];const r=await reviewVisibleDetail(f.tab,'abc',{pause:async ms=>waits.push(ms)});assert.equal(r.atEnd,true);assert.equal(waits.length,3);assert.ok(waits.every(ms=>ms===2000));assert.deepEqual(f.actions.map(a=>a.direction),['down','down']);});
test('short page is read without unnecessary scrolling',async()=>{const f=fixture();f.tab.evaluate=async()=>({status:'ready',characters:80,y:0,height:300,viewport:600,atEnd:true});const r=await reviewVisibleDetail(f.tab,'abc',{pause:async()=>{}});assert.equal(r.views.length,1);assert.equal(f.actions.length,0);});
test('cancellation during reading prevents the next scroll',async()=>{const f=fixture(),controller=new AbortController();await assert.rejects(reviewVisibleDetail(f.tab,'abc',{signal:controller.signal,pause:async()=>controller.abort()}),/取消/);assert.equal(f.actions.length,0);});
test('blocked viewport stops before waiting or scrolling',async()=>{const f=fixture();f.tab.evaluate=async()=>({status:'risk_signal'});await assert.rejects(reviewVisibleDetail(f.tab,'abc',{pause:async()=>assert.fail()}),/risk_signal/);assert.equal(f.actions.length,0);});
test('list review scrolls only until the target is visible and then pauses',async()=>{
 const {reviewListTarget}=await import('../lib/visible-reading.mjs');let reads=0;const actions=[],waits=[];
 const tab={url:async()=> 'https://h.liepin.com/search/getConditionItem',evaluate:async()=>({status:'ready',top:++reads===1?800:200,bottom:1000,viewport:600,characters:240,inView:reads>1}),act:async a=>actions.push(a)};
 const result=await reviewListTarget(tab,'.card',{pause:async ms=>waits.push(ms)});assert.equal(result.scrolls,1);assert.equal(actions.length,1);assert.equal(actions[0].direction,'down');assert.deepEqual(waits,[500,1000]);
});
test('list cancellation during visible-card dwell never opens or scrolls',async()=>{
 const {reviewListTarget}=await import('../lib/visible-reading.mjs'),controller=new AbortController();let acts=0;
 const tab={url:async()=> 'https://h.liepin.com/search/getConditionItem',evaluate:async()=>({status:'ready',top:20,bottom:200,viewport:600,characters:100,inView:true}),act:async()=>acts++};
 await assert.rejects(reviewListTarget(tab,'.card',{signal:controller.signal,pause:async()=>controller.abort()}),/取消/);assert.equal(acts,0);
});
test('long detail reports incomplete visible review instead of claiming full coverage',async()=>{
 const f=fixture();let y=0;f.tab.evaluate=async()=>({status:'ready',characters:800,y,height:10000,viewport:600,atEnd:false});f.tab.act=async a=>{y+=a.amount;};
 const result=await reviewVisibleDetail(f.tab,'abc',{pause:async()=>{}});assert.equal(result.atEnd,false);assert.equal(result.reason,'view_limit');assert.equal(result.views.length,3);
});
