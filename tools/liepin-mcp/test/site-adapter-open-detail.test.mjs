import test from 'node:test';
import assert from 'node:assert/strict';
import {adapterDetailClient} from '../lib/site-adapter-open-detail.mjs';
import {createAdapterTabLifecycle} from '../compat/adapter-tabs.mjs';
import {openMcpDetailDriver} from '../lib/detail-driver.mjs';
import {readAdapterExpandedDetail} from '../lib/site-adapter-expansion.mjs';
test('adapter lifecycle performs two distinct detail reads, closes children, returns parent',async()=>{
 let clicks=0;const closed=[],returned=[];
 const parent={id:'1',url:async()=>'https://h.liepin.com/search/getConditionItem',evaluate:async fn=>fn.name==='inspectSavedCard'?{matched:true,openerTimeOrigin:1}:'#name',act:async()=>({openedTabs:[{tab:String(++clicks+10)}]})};
 const lifecycle=createAdapterTabLifecycle({tab:parent,activateTab:async id=>returned.push(id),bindTab:async id=>({id,url:async()=>`https://h.liepin.com/resume/showresumedetail/?res_id_encode=p${id}`,evaluate:async fn=>fn.name==='inspectExperienceExpanders'?[]:{url:`https://h.liepin.com/resume/showresumedetail/?res_id_encode=p${id}`,readyState:'complete',text:'工作经历\n合成经历'},close:async()=>closed.push(id)})});
 const client=adapterDetailClient({...lifecycle,args:{tab_id:'1'}});
 for(let i=0;i<2;i++){
  const driver=await openMcpDetailDriver(client,'1',{readExpanded:readAdapterExpandedDetail});
  await driver.check({});await driver.click({});const [child]=await driver.children();
  assert.match((await driver.read(child)).url,new RegExp(`p${11+i}$`));
  await driver.returnToList();await driver.close();
 }
 assert.equal(clicks,2);assert.deepEqual(closed,['11','12']);assert.deepEqual(returned,['1','1']);assert.deepEqual(lifecycle.tabs.opened(),[]);
});
test('unpatched runtime fails before any browser action',()=>{
 assert.throws(()=>adapterDetailClient({args:{tab_id:'1'},tab:{id:'1'}}),/缺少/);
});

 test('loading retries do not trigger visible review and ready rereads review only once',async()=>{
 const {createReviewedDetailReader}=await import('../lib/site-adapter-open-detail.mjs');let calls=0,reviews=0;
 const url='https://h.liepin.com/resume/showresumedetail/?res_id_encode=abc';
 const reader=createReviewedDetailReader({read:async()=>({url,readyState:++calls===1?'loading':'complete',text:'工作经历\n伺服研发\n教育经历\n本科'}),review:async()=>{reviews++;return {views:[{}],atEnd:true};}});
 await reader({},'abc');assert.equal(reviews,0);await reader({},'abc');await reader({},'abc');assert.equal(reviews,1);assert.equal(calls,3);
});
