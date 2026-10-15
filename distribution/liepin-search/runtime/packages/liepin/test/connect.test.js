import test from 'node:test';
import assert from 'node:assert/strict';
import {connectCurrentPage,connectManagedSearch} from '../connect.js';
import {LIEPIN_SESSION,LIEPIN_CONNECTION} from '../lib/connection.js';
const url='https://h.liepin.com/search/getConditionItem#session',id='A'.repeat(32);
test('connect returns a checked existing target without page evaluation',async()=>{
 const result=await connectCurrentPage({checkRuntime(){},bind:async session=>{assert.equal(session,LIEPIN_SESSION);return {url};},
  createPage:()=>({tabs:async()=>[{page:id,url,connectionMode:LIEPIN_CONNECTION}],closeWindow:async()=>assert.fail('successful binding must remain usable')})});
 assert.equal(result.page,id);
});
test('managed search creates only the known search URL and proves ownership before page input',async()=>{
 let created=false,selected=false;
 const page={tabs:async()=>created?[{page:id,url,active:true}]:[],newTab:async actual=>{assert.equal(actual,'https://h.liepin.com/search/getConditionItem');created=true;return id;},selectTab:async actual=>{assert.equal(actual,id);selected=true;},evaluate:async()=>assert.fail('connect must not run page code')};
 const result=await connectManagedSearch({checkRuntime:()=>{},createPage:()=>page,bindRead:async()=>({url}),createReadPage:()=>({tabs:async()=>[{page:id,url}]})});
 assert.equal(result.page,id);assert.equal(result.mode,'managed');assert.equal(selected,true);
});
test('managed reuse selects only its observed target and never binds the owned manager',async()=>{
 let selections=0;
 const result=await connectManagedSearch({checkRuntime:()=>{},createPage:()=>({tabs:async()=>[{page:id,url}],newTab:async()=>assert.fail('must not navigate'),selectTab:async actual=>{assert.equal(actual,id);selections++;}}),bindRead:async()=>({url}),createReadPage:()=>({tabs:async()=>[{page:id,url}]})});
 assert.equal(result.page,id);assert.equal(selections,1);
});
test('managed foreground mismatch never evaluates or releases the owned search',async()=>{
 let releases=0;
 await assert.rejects(connectManagedSearch({checkRuntime:()=>{},createPage:()=>({tabs:async()=>[{page:id,url}],selectTab:async()=>{},closeWindow:async()=>{releases++;}}),bindRead:async()=>({url}),createReadPage:()=>({tabs:async()=>[{page:'B'.repeat(32),url}],evaluate:async()=>assert.fail('must not inspect wrong document')})}),/前台未绑定到独立搜索目标/);
 assert.equal(releases,0);
});
test('a borrowed session rejects managed selection without resetting or navigating its user tab',async()=>{
 let releases=0;
 await assert.rejects(connectManagedSearch({checkRuntime:()=>{},createPage:()=>({tabs:async()=>[{page:id,url}],selectTab:async()=>{throw Error('bound_tab_mutation_blocked');},newTab:async()=>assert.fail('must not create'),closeWindow:async()=>{releases++;}})}),/bound_tab_mutation_blocked/);
 assert.equal(releases,0);
});
test('wrong page, mismatched connection or changed target releases binding',async()=>{
 for(const scenario of ['wrong','mismatched','changed']) {
  let releases=0;
  await assert.rejects(connectCurrentPage({checkRuntime(){},bind:async()=>({url:scenario==='wrong'?'https://example.com':url}),
   createPage:()=>({tabs:async()=>[{page:id,url:scenario==='changed'?'about:blank':url,connectionMode:scenario==='mismatched'?'other-mode':LIEPIN_CONNECTION}],closeWindow:async()=>{releases++;}})}));
  assert.equal(releases,1);
 }
});
test('official bridge standard metadata binds without an experimental marker',async()=>{
 const result=await connectCurrentPage({checkRuntime(){},bind:async()=>({url}),createPage:()=>({tabs:async()=>[{page:id,url}],closeWindow:async()=>assert.fail('valid binding')})});
 assert.equal(result.connectionMode,'official');assert.equal(result.page,id);
});
test('wrong binding reports safe surface only and never inspects page contents',async()=>{
 for(const [boundUrl,label] of [['about:blank','about:blank'],['https://user:password@example.com/private-path?token=secret#private','https://example.com'],['file:///private/secret.txt','file:页面']]){
  let releases=0;
  await assert.rejects(connectCurrentPage({checkRuntime(){},bind:async()=>({url:boundUrl}),createPage:()=>({tabs:async()=>assert.fail('do not inspect wrong page'),closeWindow:async()=>{releases++;}})}),e=>{
   assert.equal(e.code,'WRONG_BOUND_PAGE');assert.ok(e.message.includes(label));assert.ok(!/password|secret|private-path/.test(e.message));return true;
  });assert.equal(releases,1);
 }
});
