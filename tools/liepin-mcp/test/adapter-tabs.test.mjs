import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdapterTabLifecycle} from '../compat/adapter-tabs.mjs';
test('only actual returned children can be bound or closed; parent is retained',async()=>{
 const calls=[];
 const api=createAdapterTabLifecycle({tab:{id:'1',act:async()=>({openedTabs:[{tab:'2'}]})},bindTab:async id=>{calls.push(['bind',id]);return {id,close:async()=>calls.push(['close',id])};},activateTab:async id=>calls.push(['activate',id])});
 await assert.rejects(api.tabs.child('2'),/not opened/);
 await api.tab.act({action:'click'});
 assert.deepEqual(api.tabs.opened(),['2']);
 await assert.rejects(api.tabs.closeChild('1'),/not opened/);
 await api.tabs.closeChild('2');await api.tabs.returnToParent();
 assert.deepEqual(calls,[['bind','2'],['close','2'],['activate','1']]);
 await assert.rejects(api.tabs.child('2'),/not opened/);
});
test('close failure preserves ownership for explicit cleanup',async()=>{
 const api=createAdapterTabLifecycle({tab:{id:'1',act:async()=>({openedTabs:[{tabId:2}]})},bindTab:async id=>({id,close:async()=>{throw Error('close failed');}}),activateTab:async()=>{}});
 await api.tab.act({});await assert.rejects(api.tabs.closeChild('2'),/close failed/);
 assert.deepEqual(api.tabs.opened(),['2']);
});
test('bound child mismatch and parent returned as child are rejected',async()=>{
 const api=createAdapterTabLifecycle({tab:{id:'1',act:async()=>({openedTabs:[{tab:'2'}]})},bindTab:async()=>({id:'3'}),activateTab:async()=>{}});
 await api.tab.act({});await assert.rejects(api.tabs.child('2'),/mismatch/);
 const bad=createAdapterTabLifecycle({tab:{id:'1',act:async()=>({openedTabs:[{tab:'1'}]})}});
 await assert.rejects(bad.tab.act({}),/Invalid/);
});
test('existing-user binding verifies metadata and never gives close ownership',async()=>{
 const {createAdapterUserTabs}=await import('../compat/adapter-tabs.mjs');
 const url='https://h.liepin.com/search/getConditionItem';let claims=0;
 const api=createAdapterUserTabs({list:async()=>[{tabId:5,url},{tabId:6,url:'https://example.test/'}],claim:async request=>{claims++;assert.equal(request.expectedUrl,url);return {page:'5',tabId:5,url};}});
 assert.equal((await api.list()).length,1);
 await assert.rejects(api.bind('5',url+'?changed'),/changed/);assert.equal(claims,0);
 assert.deepEqual(await api.bind('5',url),{id:'5',ownership:'user'});assert.equal(claims,1);
 assert.equal(api.close,undefined);
});
test('a subsequent call discovers its already claimed tab and checks current URL',async()=>{
 const {createAdapterUserTabs}=await import('../compat/adapter-tabs.mjs');
 const url='https://h.liepin.com/search/getConditionItem';let claimed=false,current=url,calls=0;
 const api=createAdapterUserTabs({
  list:async()=>claimed?[]:[{tabId:5,url}],
  listBound:async()=>claimed?[{tabId:5,url:current,state:'active'},{tabId:6,url,state:'released'},{tabId:7,url:'https://example.test/',state:'active'}]:[],
  claim:async()=>{calls++;claimed=true;return {page:'5',tabId:5,url:current};}
 });
 await api.bind('5',url);
 assert.deepEqual((await api.list()).map(row=>row.tabId),[5]);
 await api.bind('5',url);assert.equal(calls,2);
 current=url+'?changed';
 await assert.rejects(api.bind('5',url),/changed/);assert.equal(calls,2);
 assert.equal(api.close,undefined);
});
test('another session lease is unavailable, not falsely reported as a changed URL',async()=>{
 const {createAdapterUserTabs}=await import('../compat/adapter-tabs.mjs');let claims=0;
 const api=createAdapterUserTabs({list:async()=>[],listBound:async()=>[],claim:async()=>{claims++;}});
 await assert.rejects(api.bind('123','https://h.liepin.com/search/getConditionItem'),error=>error.code==='adapter_tab_unavailable'&&!/URL changed/.test(error.message));
 assert.equal(claims,0);
});
test('favorites workspace uses fixed official destination and never navigates parent',async()=>{
 const calls=[];
 const api=createAdapterTabLifecycle({tab:{id:'1',goto:async()=>{throw Error('parent must not navigate');}},openTab:async url=>{calls.push(['open',url]);return '9';},bindTab:async id=>({id,close:async()=>calls.push(['close',id])}),activateTab:async id=>calls.push(['activate',id])});
 const child=await api.tabs.openFavorites();assert.equal(child.id,'9');assert.deepEqual(api.tabs.opened(),['9']);
 await api.tabs.closeChild('9');await api.tabs.returnToParent();
 assert.deepEqual(calls,[['open','https://h.liepin.com/resumemanage/showmytalentlist'],['close','9'],['activate','1']]);
});
test('workspace failures do not grant ownership of parent or unreturned tabs',async()=>{
 for(const value of ['1','bad',undefined]){
  const api=createAdapterTabLifecycle({tab:{id:'1'},openTab:async()=>value,bindTab:async()=>{throw Error('must not bind');}});
  await assert.rejects(api.tabs.openFavorites(),/Invalid created/);assert.deepEqual(api.tabs.opened(),[]);
 }
 const api=createAdapterTabLifecycle({tab:{id:'1'},openTab:async()=>{throw Error('connection lost');}});
 await assert.rejects(api.tabs.openFavorites(),/connection lost/);assert.deepEqual(api.tabs.opened(),[]);
});
test('search workspace creates a fixed search destination without changing parent',async()=>{
 let openedUrl;const api=createAdapterTabLifecycle({tab:{id:'1'},openTab:async url=>{openedUrl=url;return '7';},bindTab:async id=>({id})});
 assert.equal((await api.tabs.openSearch()).id,'7');assert.equal(openedUrl,'https://h.liepin.com/search/getConditionItem');assert.deepEqual(api.tabs.opened(),['7']);
});
test('global existence lookup requires an exact metadata response, never inventory absence',async()=>{
 const {createAdapterUserTabs}=await import('../compat/adapter-tabs.mjs');let calls=0;
 const api=createAdapterUserTabs({list:async()=>[],getMetadata:async id=>{calls++;return {tabId:id,exists:true,verification:'chrome-tabs-get'};}});
 assert.equal((await api.lookup('5')).exists,true);assert.equal(calls,1);
 for(const id of ['0','bad','9007199254740992'])await assert.rejects(api.lookup(id),/Invalid tab ID/);
 assert.equal(calls,1);
 await assert.rejects(createAdapterUserTabs({}).lookup('5'),/unavailable/);
 for(const response of [null,{tabId:'6',exists:false},{tabId:'5',exists:'false'}])await assert.rejects(createAdapterUserTabs({getMetadata:async()=>response}).lookup('5'),/invalid/);
});
