import test from 'node:test';
import assert from 'node:assert/strict';
import {openMcpDetailDriver,detailIdentityFromUrl,DEFAULT_DETAIL_TIMINGS} from '../lib/detail-driver.mjs';
import {withStep,isStepTimeout} from '../lib/step-budget.mjs';

const SEARCH='https://h.liepin.com/search/getConditionItem';
const detail=id=>`https://h.liepin.com/resume/showresumedetail/?res_id_encode=${id}`;
const row={cardSelector:'.card',detailTarget:'.name',summary:'李** 伺服'};
const timings={clickReplyMs:40,discoveryMs:400,listTabsMs:60,pollMs:10};

function fakeClient({clickReply,tabsAfterClick=[],adopt=true}={}){
 let clicks=0,closed=0,activations=0,tabs=[];
 const handles=new Map();
 const makeHandle=id=>({id:String(id),url:async()=>detail(`r${id}`),title:async()=>'详情',evaluate:async()=>({}),act:async()=>({}),close:async()=>{closed++;}});
 return {
  handles,
  get clicks(){return clicks;},
  get closed(){return closed;},
  get activations(){return activations;},
  async verify(){return true;},
  tab(){return {id:'1',url:async()=>SEARCH,evaluate:async fn=>fn.name==='inspectSavedCard'?{matched:true,openerTimeOrigin:1}:'#name',
   act:async()=>{clicks++;tabs=[...tabsAfterClick];return clickReply();},
   activate:async()=>{activations++;}};},
  claimOpenedTab(id){return makeHandle(id);},
  async userTabs(){return tabs.map(tabId=>({tabId,url:detail(`r${tabId}`)}));},
  ...(adopt?{async adoptTab(id){handles.set(String(id),makeHandle(id));return handles.get(String(id));}}:{}),
 };
}

test('click reply never returns: detail is confirmed by address, read and closed',async()=>{
 const client=fakeClient({clickReply:()=>new Promise(()=>{}),tabsAfterClick:[77]});
 const driver=await openMcpDetailDriver(client,'1',{readExpanded:async(handle,resumeId)=>({url:await handle.url(),resumeId}) ,timings});
 assert.equal(await driver.check(row),true);
 await driver.click(row);
 assert.equal(driver.method,'observed-card-address-adopt');
 const [child]=await driver.children();
 assert.equal(child.page,'77');
 assert.match((await driver.read(child)).url,/r77$/);
 await driver.returnToList();
 assert.equal(client.closed,1,'detail tab is closed by this operation');
 assert.equal(client.activations,1,'returns to the search tab');
});

test('click reply reports two tabs: ids are not trusted, single detail address wins',async()=>{
 const client=fakeClient({clickReply:()=>({openedTabs:[{tab:'5'},{tab:'6'}]}),tabsAfterClick:[88]});
 const driver=await openMcpDetailDriver(client,'1',{readExpanded:async handle=>({url:await handle.url()}),timings});
 await driver.check(row);await driver.click(row);
 assert.equal(driver.method,'observed-card-address-adopt');
 assert.equal((await driver.children())[0].page,'88');
});

test('click reply still works: fast path is unchanged',async()=>{
 const client=fakeClient({clickReply:()=>({openedTabs:[{tab:'42'}]})});
 const driver=await openMcpDetailDriver(client,'1',{readExpanded:async handle=>({url:await handle.url()}),timings});
 await driver.check(row);await driver.click(row);
 assert.equal(driver.method,'observed-card-mcp-child');
 assert.equal((await driver.children())[0].page,'42');
});

test('no detail tab within the window: explicit stop with a step trace, never a second click',async()=>{
 const client=fakeClient({clickReply:()=>new Promise(()=>{}),tabsAfterClick:[]});
 const driver=await openMcpDetailDriver(client,'1',{readExpanded:async()=>({}),timings});
 await driver.check(row);
 await assert.rejects(()=>driver.click(row),error=>{
  assert.equal(error.code,'DETAIL_TAB_NOT_CONFIRMED');
  assert.ok(Array.isArray(error.steps)&&error.steps.length>=2,'step trace is attached');
  assert.ok(error.steps.some(step=>step.step==='click-reply'&&step.outcome==='timeout'));
  return true;
 });
 assert.equal(client.clicks,1,'the click is dispatched exactly once');
});

test('runtime without adopt still reports the detail address instead of hanging',async()=>{
 const client=fakeClient({clickReply:()=>new Promise(()=>{}),tabsAfterClick:[91],adopt:false});
 const driver=await openMcpDetailDriver(client,'1',{readExpanded:async()=>({}),timings});
 await driver.check(row);
 await assert.rejects(()=>driver.click(row),error=>{
  assert.equal(error.code,'ADAPTER_ADOPT_UNAVAILABLE');
  assert.equal(error.discovered.tabId,'91');
  assert.match(error.discovered.url,/res_id_encode=r91/);
  return true;
 });
});

test('only a single res_id_encode on the exact detail path is a detail identity',()=>{
 assert.equal(detailIdentityFromUrl(detail('abc')).resumeId,'abc');
 assert.equal(detailIdentityFromUrl('https://h.liepin.com/resume/showresumedetail/?res_id_encode=a&res_id_encode=b'),null);
 assert.equal(detailIdentityFromUrl('https://h.liepin.com/resume/showresumedetail/'),null);
 assert.equal(detailIdentityFromUrl('http://h.liepin.com/resume/showresumedetail/?res_id_encode=abc'),null);
 assert.equal(detailIdentityFromUrl('https://h.liepin.com.evil.test/resume/showresumedetail/?res_id_encode=abc'),null);
 assert.equal(detailIdentityFromUrl(SEARCH),null);
});

test('a step that never returns is a timeout, not a hang',async()=>{
 const trace=[];
 await assert.rejects(()=>withStep('never',()=>new Promise(()=>{}),{timeoutMs:20,trace}),error=>isStepTimeout(error));
 assert.deepEqual(trace,[{step:'never',ms:trace[0].ms,outcome:'timeout'}]);
 assert.ok(trace[0].ms>=15);
 assert.equal(DEFAULT_DETAIL_TIMINGS.clickReplyMs,12000);
});

test('missing before inventory cannot adopt or close an existing detail',async()=>{
 const client=fakeClient({clickReply:()=>new Promise(()=>{}),tabsAfterClick:[77]});
 let adopted=0;client.userTabs=()=>new Promise(()=>{});client.adoptTab=async()=>{adopted++;};
 const driver=await openMcpDetailDriver(client,'1',{timings});
 await driver.check(row);
 await assert.rejects(()=>driver.click(row),{code:'DETAIL_DISCOVERY_UNAVAILABLE'});
 await driver.close();assert.equal(adopted,0);assert.equal(client.closed,0);assert.equal(client.clicks,1);
});
