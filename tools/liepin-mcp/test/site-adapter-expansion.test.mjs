import test from 'node:test';
import assert from 'node:assert/strict';
import {adapterExpansionPage} from '../lib/site-adapter-expansion.mjs';
const good='https://h.liepin.com/resume/showresumedetail/?res_id_encode=abc';
test('expansion dispatches through public act and preserves Chinese action log',async()=>{
 const calls=[],logs=[];const tab={url:async()=>good,act:async arg=>{calls.push(arg);return {};},evaluate:async()=>({})};
 const {createActions}=adapterExpansionPage(tab,{resumeId:'abc',onAction:e=>logs.push(e)});
 await createActions().click({selector:'#observed'});
 assert.deepEqual(calls,[{action:'click',target:{selector:'#observed'}}]);assert.match(logs[0].description,/点击/);
});
test('identity change stops expansion and prevents later retry even after URL restores',async()=>{
 let url=good,calls=0;const tab={url:async()=>url,act:async()=>calls++,evaluate:async()=>calls++};
 const {createActions}=adapterExpansionPage(tab,{resumeId:'abc'});url=good.replace('abc','other');
 await assert.rejects(createActions().click({selector:'#x'}),/身份/);url=good;
 await assert.rejects(createActions().click({selector:'#x'}),/停止/);assert.equal(calls,0);
});
test('cancellation after URL read prevents mutation',async()=>{
 const c=new AbortController();let calls=0;
 const tab={url:async()=>{c.abort();return good;},act:async()=>calls++};
 await assert.rejects(adapterExpansionPage(tab,{resumeId:'abc',signal:c.signal}).createActions().click({selector:'#x'}),/取消/);
 assert.equal(calls,0);
});
