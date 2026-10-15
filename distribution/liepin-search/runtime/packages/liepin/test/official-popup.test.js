import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createOfficialPopupController,createManagedPopupController,inspectOfficialPopup} from '../lib/official-popup.js';
const parentId='A'.repeat(32),childId='B'.repeat(32);
const expectedUrl='https://h.liepin.com/search/getConditionItem#session';
const childUrl='https://h.liepin.com/resume/showresumedetail/?res_id_encode=synthetic';
const row={cardSelector:'#card',detailTarget:'#name',summary:'合成卡片'};
test('same-URL opener from a different document is rejected without reading or closing it',()=>{
 const target={matches:()=>true},card={innerText:row.summary,contains:n=>n===target};
 const parent={location:{href:expectedUrl},performance:{timeOrigin:456},document:{querySelectorAll:s=>s===row.cardSelector?[card]:[target]}};
 const context={URL,location:{href:childUrl},window:{opener:parent,close:()=>assert.fail('no close')}};
 const input={...row,expectedUrl,detailUrl:childUrl,openerTimeOrigin:123};
 assert.equal(vm.runInNewContext(`(${inspectOfficialPopup.toString()})(${JSON.stringify(input)})`,context),false);
 parent.performance.timeOrigin=123;
 assert.equal(vm.runInNewContext(`(${inspectOfficialPopup.toString()})(${JSON.stringify(input)})`,context),true);
});
test('managed popup refuses a missing document origin before discovery',()=>{
 const c=createManagedPopupController({page:{},parentPage:{},pageId:parentId,expectedUrl,bind:async()=>assert.fail('must not bind')});
 assert.throws(()=>c.clicked(row),/缺少实际搜索文档来源/);
});
test('managed return selects its exact owned parent without binding/resetting the parent or closing the detail',async()=>{
 let selections=0;
 const controller=createManagedPopupController({page:{},pageId:parentId,expectedUrl,
  bind:async()=>assert.fail('parent return must never bind the owned session'),
  parentPage:{selectTab:async id=>{assert.equal(id,parentId);selections++;},tabs:async()=>[{page:parentId,url:expectedUrl,active:true}],closeWindow:async()=>assert.fail('must retain search')}});
 await controller.returnToList();assert.equal(selections,1);
});
test('managed return refuses a changed target, URL or inactive search before the queue can continue',async()=>{
 for(const tab of [{page:childId,url:expectedUrl,active:true},{page:parentId,url:childUrl,active:true},{page:parentId,url:expectedUrl,active:false}]) {
  const controller=createManagedPopupController({page:{},pageId:parentId,expectedUrl,bind:async()=>assert.fail(),parentPage:{selectTab:async()=>{},tabs:async()=>[tab]}});
  await assert.rejects(controller.returnToList(),/未确认返回原搜索目标/);
 }
});
function fixture({valid=true}={}) {
 let tab={page:parentId,url:expectedUrl},binds=0,reads=0,closes=0;
 const page={tabs:async()=>[tab],setActivePage:()=>{},evaluate:async(fn,input)=>{assert.equal(fn,inspectOfficialPopup);assert.equal(input.summary,row.summary);reads++;return valid;}};
 const controller=createOfficialPopupController({page,pageId:parentId,expectedUrl,
  bind:async()=>{binds++;return {url:tab.url};},
  executeClose:async(pageId,input)=>{assert.equal(pageId,childId);assert.equal(input.close,true);closes++;tab={page:parentId,url:expectedUrl};throw Error('Target closed after dispatch');}});
 return {controller,setTab:value=>{tab=value;},counts:()=>({binds,reads,closes})};
}
test('official foreground popup is adopted once and cannot close a borrowed detail to guess its parent',async()=>{
 const f=fixture();assert.deepEqual(await f.controller.children(),[]);
 f.controller.clicked(row);f.setTab({page:childId,url:childUrl});
 const children=await f.controller.children();assert.equal(children[0].page,childId);
 assert.deepEqual(await f.controller.children(),children);assert.deepEqual(f.counts(),{binds:1,reads:1,closes:0});
 await f.controller.adopt(children[0]);await assert.rejects(f.controller.returnToList(),/详情保留/);
 assert.deepEqual(f.counts(),{binds:1,reads:1,closes:0});
 await assert.rejects(f.controller.returnToList(),/自动返回尚未验收/);assert.equal(f.counts().closes,0);
});
test('remaining foreground search is observed without re-clicking or reading a candidate',async()=>{
 const f=fixture();f.controller.clicked(row);
 assert.deepEqual(await f.controller.children(),[]);assert.equal(f.counts().reads,0);
 assert.deepEqual(f.controller.observation(),{bindingMatches:true,tabs:[{page:parentId,state:'search'}]});
});
test('a pending popup is observed without executing page code until its URL is known',async()=>{
 const f=fixture();f.controller.clicked(row);
 for(const url of [undefined,'','about:blank']) {
  f.setTab({page:childId,url});assert.deepEqual(await f.controller.children(),[]);assert.equal(f.counts().reads,0);
  assert.deepEqual(f.controller.observation(),{bindingMatches:true,tabs:[{page:childId,state:'pending'}]});
 }
 f.setTab({page:childId,url:childUrl});assert.equal((await f.controller.children())[0].page,childId);
});
test('a foreign foreground page is rejected before page evaluation',async()=>{
 const f=fixture();f.controller.clicked(row);f.setTab({page:childId,url:'https://example.com/private'});
 await assert.rejects(f.controller.children(),/不是本次猎聘详情/);assert.equal(f.counts().reads,0);
});
test('a detail with an unconfirmed opener is never adopted or closed',async()=>{
 const f=fixture({valid:false});f.controller.clicked(row);f.setTab({page:childId,url:childUrl});
 await assert.rejects(f.controller.children(),/搜索页来源/);
 await assert.rejects(f.controller.returnToList());assert.equal(f.counts().closes,0);
});
test('adoption refuses a different target or a changed lease',async()=>{
 const f=fixture();f.controller.clicked(row);f.setTab({page:childId,url:childUrl});
 const [child]=await f.controller.children();
 await assert.rejects(f.controller.adopt({...child,page:'C'.repeat(32)}),/不是已核对/);
 f.setTab({page:parentId,url:expectedUrl});await assert.rejects(f.controller.adopt(child),/绑定丢失/);
});
test('return does not close a tab or bind another same-URL target',async()=>{
 let tab={page:childId,url:childUrl},closes=0;
 const c=createOfficialPopupController({pageId:parentId,expectedUrl,
  page:{tabs:async()=>[tab],setActivePage:()=>{},evaluate:async()=>true},
  bind:async()=>({url:tab.url}),executeClose:async()=>{closes++;tab={page:'C'.repeat(32),url:expectedUrl};return true;}});
 c.clicked(row);await c.children();await assert.rejects(c.returnToList(),/详情保留/);
 await assert.rejects(c.returnToList(),/自动返回尚未验收/);assert.equal(closes,0);
});
test('popup provenance checks opener URL, unique card, target and saved text without closing',()=>{
 let closed=0;
 const target={matches:()=>true},card={innerText:row.summary,contains:t=>t===target};
 const parent={closed:false,focus:()=>{},location:{href:expectedUrl},document:{querySelectorAll:s=>s===row.cardSelector?[card]:[target]}};
 const context={URL,location:{href:childUrl},window:{opener:parent,close:()=>{closed++;}}};
 const input={...row,expectedUrl,detailUrl:childUrl,close:true};
 const run=()=>vm.runInNewContext(`(${inspectOfficialPopup.toString()})(${JSON.stringify(input)})`,context);
 assert.equal(run(),true);assert.equal(closed,0);
 for(const alter of [()=>{parent.location.href='https://example.com';},()=>{parent.location.href=expectedUrl;card.innerText='changed';},()=>{card.innerText=row.summary;context.window.opener=null;}]) {
  alter();assert.equal(run(),false);assert.equal(closed,0);
 }
});
test('only the observed read badge may be added; altered content and duplicate badges still fail',()=>{
 const target={matches:()=>true},badge={textContent:'阅'};
 let badges=[badge];
 const summary='合成姓名\n合成经历',card={innerText:'合成姓名\n阅\n合成经历',contains:t=>t===target,querySelectorAll:()=>badges};
 const parent={location:{href:expectedUrl},document:{querySelectorAll:s=>s===row.cardSelector?[card]:[target]}};
 const context={URL,location:{href:childUrl},window:{opener:parent,close:()=>assert.fail('read-only provenance must not close')}};
 const input={...row,summary,expectedUrl,detailUrl:childUrl};
 const run=()=>vm.runInNewContext(`(${inspectOfficialPopup.toString()})(${JSON.stringify(input)})`,context);
 assert.equal(run(),true);
 card.innerText='合成姓名\n阅\n改变的经历';assert.equal(run(),false);
 card.innerText='合成姓名\n阅\n合成经历';badges=[badge,badge];assert.equal(run(),false);
});
