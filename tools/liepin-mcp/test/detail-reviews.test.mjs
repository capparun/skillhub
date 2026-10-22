import test from 'node:test';import assert from 'node:assert/strict';
import {detailReviewStore} from '../compat/detail-reviews.mjs';
import {createAdapterTabLifecycle} from '../compat/adapter-tabs.mjs';
const url='https://h.liepin.com/resume/showresumedetail/?res_id_encode=abc';
function fixture(){let closed=0,returned=0,state={url,timeOrigin:1};const session={};const child={id:'2',evaluate:async()=>state,close:async()=>{closed++;}};return {session,child,setState:v=>{state=v;},get closed(){return closed;},get returned(){return returned;},retain:store=>store.retain({file:'/task',parent:'1',child,returnToParent:async()=>{returned++;}})};}
test('retained detail survives another call in same session and closes without reopening',async()=>{
 const f=fixture(),store=detailReviewStore(f.session),r=await f.retain(store);
 assert.equal(detailReviewStore(f.session),store);
 await store.use(r.token,{file:'/task',parent:'1'},child=>assert.equal(child,f.child));
 assert.deepEqual(await store.finish(r.token,{file:'/task',parent:'1'}),{closed:true,returned:true});
 assert.equal(f.closed,1);assert.equal(f.returned,1);
 await assert.rejects(store.use(r.token,{file:'/task',parent:'1'},()=>{}),/不存在/);
});
test('historical token cannot grant close rights after runtime session restart',async()=>{
 const f=fixture(),r=await f.retain(detailReviewStore(f.session));
 await assert.rejects(detailReviewStore({}).finish(r.token,{file:'/task',parent:'1'}),/不存在/);assert.equal(f.closed,0);
});
test('wrong task or parent cannot operate a retained detail',async()=>{
 const f=fixture(),store=detailReviewStore(f.session),r=await f.retain(store);
 for(const identity of [{file:'/other',parent:'1'},{file:'/task',parent:'9'}])await assert.rejects(store.finish(r.token,identity),/归属/);
 assert.equal(f.closed,0);
});
test('reloaded or navigated detail is preserved rather than silently closed',async()=>{
 for(const snapshot of [{url,timeOrigin:2},{url:url+'&changed=1',timeOrigin:1}]){
  const f=fixture(),store=detailReviewStore(f.session),r=await f.retain(store);f.setState(snapshot);
  await assert.rejects(store.finish(r.token,{file:'/task',parent:'1'}),/导航或重新加载/);assert.equal(f.closed,0);
 }
});
test('one unresolved review blocks another read on the same parent',async()=>{
 const f=fixture(),store=detailReviewStore(f.session);await f.retain(store);
 assert.throws(()=>store.assertAvailable('1'),/先完成/);store.assertAvailable('9');
});
test('retaining transfers only an actually opened child out of per-call cleanup',async()=>{
 const f=fixture(),store=detailReviewStore(f.session);
 const lifecycle=createAdapterTabLifecycle({tab:{id:'1',act:async()=>({openedTabs:[{tab:'2'}]})},reviewStore:store,bindTab:async()=>f.child,activateTab:async()=>{}});
 await assert.rejects(lifecycle.tabs.retainReview('2','/task'),/not opened/);
 await lifecycle.tab.act({});const r=await lifecycle.tabs.retainReview('2','/task');assert.deepEqual(lifecycle.tabs.opened(),[]);
 await store.finish(r.token,{file:'/task',parent:'1'});assert.equal(f.closed,1);
});
test('concurrent review operations cannot dispatch twice',async()=>{
 const f=fixture(),store=detailReviewStore(f.session),r=await f.retain(store);let release;
 const pending=store.use(r.token,{file:'/task',parent:'1'},()=>new Promise(resolve=>{release=resolve;}));
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(store.finish(r.token,{file:'/task',parent:'1'}),/正在执行/);release();await pending;
});

import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createTask,updateTask,mergeListResults,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {detailTargets} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-targets.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {grantOperations} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {createHash} from 'node:crypto';
import {evaluationFingerprint} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/evaluation.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
import {openAdapterDetail} from '../lib/site-adapter-open-detail.mjs';
import {continueDetailReview} from '../lib/site-adapter-detail-review.mjs';
test('read, evaluate boundary, and close across adapter calls open the detail only once',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'detail-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);
 updateTask(file,task=>mergeListResults(task,[{source:'liepin',summary:'synthetic',cardSelector:'.card',detailTarget:'.name'}],{roundId:'trial'}));
 const [target]=detailTargets(readTask(file)),now=new Date().toISOString();createSiteScope(file+'.scope',{label:'synthetic',maxOperations:2,confirmedAt:now});bindSiteScope(file,file+'.scope');
 authorizeTask(file,{allowedKinds:['detail-open'],allowedRequests:[{kind:'detail-open',payload:{observationId:target.id,observationHash:target.hash,page:'1'}}],maxOperations:2,scope:'synthetic',confirmedAt:now});
 let clicks=0,closes=0,returns=0,fi=0;const favoriteClicks=[];const favoriteStates=[{known:true,saved:false,button:'#favorite'},{known:true,saved:false,addDialog:true,groupSelector:'#group'},{known:true,saved:false,addDialog:true,groupSelected:true,save:'#save'},{known:true,saved:true}];const store=detailReviewStore({});
 const child={id:'2',url:async()=>url,evaluate:async fn=>fn.name==='inspectFavorite'?favoriteStates[Math.min(fi++,3)]:fn.name==='inspectExperienceExpanders'?[]:{url,timeOrigin:1,readyState:'complete',text:'工作经历\n合成职责\n教育经历\n合成本科'},act:async args=>favoriteClicks.push(args.target.selector),close:async()=>{closes++;}};
 const parent={id:'1',url:async()=>'https://h.liepin.com/search/getConditionItem',evaluate:async fn=>fn.name==='inspectSavedCard'?{matched:true,openerTimeOrigin:1}:'#name',act:async()=>{clicks++;return {openedTabs:[{tab:'2'}]};}};
 const lifecycle=createAdapterTabLifecycle({tab:parent,reviewStore:store,bindTab:async()=>child,activateTab:async()=>{returns++;}});
 const opened=await openAdapterDetail({...lifecycle,detailReviews:store,args:{file,operation_id:'read',tab_id:'1',observation_id:target.id,keep_open:true}});
 assert.equal(clicks,1);assert.equal(closes,0);assert.equal(returns,0);assert.equal(readTask(file).detailReviews[0].status,'open');
 const context={detailReviews:store,args:{file,parent_tab_id:'1',review_token:opened.review.token,action:'add',group:'group',operation_id:'favorite'}};
 await assert.rejects(continueDetailReview(context),/跟进依据/);assert.equal(clicks,1);assert.equal(closes,0);
 updateTask(file,task=>{
  const criteria=[{id:'x',kind:'required'}];task.requirements.criteria=criteria;
  const candidate=task.candidates.find(c=>c.key==='liepin:abc');
  task.sourcing={contracts:[{revision:1,standardHash:createHash('sha256').update(JSON.stringify(criteria)).digest('hex')}],decisions:[{candidateKey:candidate.key,contractRevision:1,evidenceFingerprint:evaluationFingerprint(task,candidate),decision:'follow_up',group:'group'}]};return task;
 });
 const [linked]=detailTargets(readTask(file));
 grantOperations(file,{allowedRequests:[{kind:'favorite',payload:{observationId:linked.id,observationHash:linked.hash,page:'1',resumeId:'abc',action:'add',group:'group'}}],confirmedAt:now,scope:'synthetic favorite'});
 const added=await continueDetailReview(context);assert.equal(added.saved,true);assert.equal(clicks,1);assert.equal(closes,0);assert.deepEqual(favoriteClicks,['#favorite','#group','#save']);
 const closed=await continueDetailReview({...context,args:{...context.args,action:'close'}});
 assert.equal(closed.closed,true);assert.equal(closes,1);assert.equal(returns,1);assert.equal(clicks,1);
 assert.equal((await continueDetailReview({...context,args:{...context.args,action:'close'}})).cached,true);assert.equal(closes,1);
});

test('closed detail is not reported as returned when parent activation fails',async()=>{
 const f=fixture(),store=detailReviewStore({});
 const r=await store.retain({file:'/task',parent:'1',child:f.child,returnToParent:async()=>{throw Error('parent missing');}});
 const result=await store.finish(r.token,{file:'/task',parent:'1'});
 assert.equal(result.closed,true);assert.equal(result.returned,false);assert.match(result.returnError,/parent missing/);assert.equal(f.closed,1);
});
