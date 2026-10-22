import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {inspectFavorites,readFavorites,openFavoritesDriver} from '../lib/favorites-list.js';
import {createTask,readTask} from '../lib/task-store.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
import {authorizeTask} from '../lib/operation-gate.js';
const element=text=>({innerText:text,getClientRects:()=>[{}],querySelectorAll:()=>[]});
test('selected group readback preserves its exact name and requires matching visible count',()=>{
 let selection='研发 A（1）';
 const context=vm.createContext({location:{origin:'https://h.liepin.com',pathname:'/resumemanage/showmytalentlist'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{body:{innerText:'共 1 份简历'},querySelectorAll:s=>s==='dl'?[element('收藏时间：2026-10-20')]:s==='.ant-tree-node-selected'?[element(selection)]:s.startsWith('h1,')?[element('收藏的简历·Talent')]:[]}});
 const read=()=>vm.runInContext(`(${inspectFavorites.toString()})({limit:1})`,context);
 assert.equal(read().selectedGroup,'研发 A');assert.equal(read().groupReadback,true);
 selection='研发 A（2）';assert.equal(read().status,'loading');
 selection='无法辨认组';assert.equal(read().groupReadback,false);
});
test('official favorites reader accepts standard tabs metadata and performs only fixed inspection',async()=>{
 const pageId='A'.repeat(32),url='https://h.liepin.com/resumemanage/showmytalentlist';let reads=0,closed=0;
 const page={setActivePage:id=>assert.equal(id,pageId),tabs:async()=>[{page:pageId,url}],evaluate:async(fn,input)=>{reads++;if(fn===inspectFavorites){assert.equal(input.limit,2);return {status:'ready',rows:[],total:0};}return {url};},closeWindow:async()=>{closed++;}};
 const driver=await openFavoritesDriver(pageId,{checkRuntime:()=>{},createPage:()=>page});assert.equal((await driver.read(2)).status,'ready');await driver.close();assert.equal(reads,2);assert.equal(closed,1);
});
test('official favorites reader rejects a wrong bound page before executing code',async()=>{
 const pageId='A'.repeat(32);let closed=0;
 await assert.rejects(openFavoritesDriver(pageId,{checkRuntime:()=>{},createPage:()=>({setActivePage:()=>{},tabs:async()=>[{page:pageId,url:'https://example.com/private'}],evaluate:async()=>assert.fail('must not evaluate'),closeWindow:async()=>{closed++;}})}),/不是预期猎聘页面/);assert.equal(closed,1);
});
test('favorites inspector requires the favorites heading and preserves missing identity',()=>{
 let heading='我的人才·Talent';const card=element('合成人选\n收藏时间：2026-10-12');
 const context=vm.createContext({location:{origin:'https://h.liepin.com',pathname:'/resumemanage/showmytalentlist'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{body:{innerText:'共 310 份简历'},querySelectorAll:selector=>selector==='dl'?[card]:selector.startsWith('h1,')?[element(heading)]:[]}});
 const inspect=()=>vm.runInContext(`(${inspectFavorites.toString()})({limit:1})`,context);
 assert.equal(inspect().status,'not_favorites');heading='收藏的简历·Talent';
 const result=inspect();assert.equal(result.status,'ready');assert.equal(result.rows.length,1);assert.equal(result.rows[0].savedAt,'2026-10-12');assert.equal(result.rows[0].resumeId,undefined);
 context.document.body.innerText='共 310 份简历 安全验证';assert.equal(inspect().status,'blocked');
});
for(const mode of ['populated','empty','blocked'])test(`favorites command persists and reuses evidence, mode=${mode}`,async t=>{
 const blocked=mode==='blocked',empty=mode==='empty';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-favorites-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString(),page='A'.repeat(32);
 createTask(file);createSiteScope(scope,{label:'fixture',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['inspect'],maxOperations:1,confirmedAt:now,scope:'favorites fixture',allowedRequests:[{kind:'inspect',payload:{view:'favorites',page,limit:1}}]});
 let reads=0,closes=0;
 const options={openDriver:async()=>({read:async()=>{reads++;return blocked?{status:'not_favorites'}:{status:'ready',total:empty?0:10,rows:empty?[]:[{summary:'合成收藏',detailLinks:[]}]};},close:async()=>{closes++;}})};
 const args={file,page,limit:1,operationId:'favorites-one'};
 if(blocked){await assert.rejects(readFavorites(args,options),/收藏列表未确认/);assert.equal(readTask(file).status,'paused');}
 else {await readFavorites(args,options);await readFavorites(args,options);const task=readTask(file);assert.equal(task.unlinkedObservations.length,empty?0:1);assert.equal(task.operations[0].evidence.collection,'favorites');if(empty){assert.equal(task.operations[0].evidence.total,0);assert.deepEqual(task.operations[0].evidence.rows,[]);}else assert.equal(task.unlinkedObservations[0].data.collection,'favorites');}
 assert.equal(reads,1);assert.equal(closes,1);
});

for(const scenario of ['navigate','already-ready','ambiguous','blocked','never-ready'])test(`favorites navigation preserves collection boundary: ${scenario}`,async()=>{
 const {readFavoritesView,inspectFavoritesEntry}=await import('../lib/favorites-list.js');let reads=0,clicks=0;
 const page={evaluate:async(fn,arg)=>{
  if(fn===inspectFavoritesEntry)return scenario==='ambiguous'?null:'span[data-tlg-ext="synthetic"]';
  assert.equal(fn,inspectFavorites);assert.equal(arg.limit,2);reads++;
  if(scenario==='blocked')return {status:'blocked'};
  if(scenario==='already-ready'||scenario==='navigate'&&reads>=3)return {status:'ready',total:0,rows:[]};
  return {status:'not_favorites'};
 }};
 const result=await readFavoritesView(page,2,{click:async()=>{clicks++;},pause:async()=>{}});
 assert.equal(clicks,['navigate','never-ready'].includes(scenario)?1:0);
 assert.equal(result.status,['navigate','already-ready'].includes(scenario)?'ready':scenario==='blocked'?'blocked':'not_favorites');
 assert.equal(reads,1+result.timings.entryPolls);
 assert.ok(result.timings.entryPolls<=40);
});
test('favorites waits for a delayed navigation tree and clicks only after it appears',async()=>{
 const {readFavoritesView,inspectFavoritesEntry}=await import('../lib/favorites-list.js');let entries=0,clicks=0,pauses=0;
 const page={evaluate:async(fn)=>fn===inspectFavoritesEntry?(++entries<3?null:'observed-favorites-selector'):{status:clicks?'ready':'not_favorites',total:0,rows:[]}};
 const result=await readFavoritesView(page,2,{click:async selector=>{assert.equal(selector,'observed-favorites-selector');clicks++;},pause:async()=>{pauses++;}});
 assert.equal(result.status,'ready');assert.equal(clicks,1);assert.equal(entries,3);assert.equal(pauses,3);
});
for(const scenario of ['spinner','count-mismatch','confirmed-empty'])test(`favorites does not accept transient empty results: ${scenario}`,()=>{
 const context=vm.createContext({location:{origin:'https://h.liepin.com',pathname:'/resumemanage/showmytalentlist'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{body:{innerText:'共 0 份简历'},querySelectorAll:selector=>selector==='dl'?[]:selector.startsWith('.ant-spin')?(scenario==='spinner'?[element('加载中')]:[]):selector==='.ant-tree-node-selected'?[element(scenario==='count-mismatch'?'我的收藏（310）':'我的收藏（0）')]:[element('收藏的简历·Talent')]}});
 const result=vm.runInContext(`(${inspectFavorites.toString()})({limit:2})`,context);assert.equal(result.status,scenario==='confirmed-empty'?'ready':'loading');
});
for(const scenario of ['already-selected','switch','missing','wrong-readback','blocked'])test(`exact group readback: ${scenario}`,async()=>{
 const {readFavoritesView,inspectFavoriteGroupEntry}=await import('../lib/favorites-list.js');let clicks=0,reads=0;
 const page={evaluate:async(fn,arg)=>{
  if(fn===inspectFavoriteGroupEntry){assert.equal(arg.group,'目标组');return scenario==='missing'?null:'#observed-group';}
  reads++;if(clicks&&scenario==='blocked')return {status:'blocked'};
  return {status:'ready',total:1,rows:[],groupReadback:true,selectedGroup:scenario==='already-selected'||clicks&&scenario==='switch'?'目标组':'其他组'};
 }};
 const r=await readFavoritesView(page,2,{group:'目标组',pause:async()=>{},click:async(selector,label)=>{assert.equal(selector,'#observed-group');assert.equal(label,'目标组');clicks++;}});
 assert.equal(clicks,['already-selected','missing'].includes(scenario)?0:1);
 assert.equal(r.status,['already-selected','switch'].includes(scenario)?'ready':scenario==='missing'?'group_not_found_or_ambiguous':scenario==='blocked'?'blocked':'group_selection_not_confirmed');
 assert.equal(reads,1+r.timings.entryPolls+r.timings.groupPolls);
 assert.ok(r.timings.groupPolls<=16);
});
test('exact group verification preserves candidate evidence and stores the membership receipt',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'favorite-membership-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString(),page='A'.repeat(32),group='目标组';
 createTask(file);createSiteScope(scope,{label:'synthetic',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['inspect'],maxOperations:1,confirmedAt:now,scope:'核实目标组',allowedRequests:[{kind:'inspect',payload:{view:'favorites',page,limit:2,group}}]});
 const before=readTask(file).candidates;
 const result=await readFavorites({file,page,group,limit:2,operationId:'membership'}, {openDriver:async()=>({read:async()=>({status:'ready',total:1,selectedGroup:group,groupReadback:true,rows:[{summary:'合成人选',detailLinks:['/resume/showresumedetail/?res_id_encode=synthetic']}]}),close:async()=>{}})});
 assert.equal(result.rows[0].resumeId,'synthetic');assert.equal(result.verification,'favorites-list-readback');assert.deepEqual(readTask(file).candidates,before);assert.equal(readTask(file).operations[0].evidence.selectedGroup,group);
});

test('group reread requires a completed same-group mutation and binds it into the request',async t=>{
 const {updateTask}=await import('../lib/task-store.js');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'favorites-after-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file);
 const args={file,page:'123',limit:10,group:'组A',operationId:'read-after',afterOperationId:'write-one'};let opened=0,request;
 const deps={validatePage:()=>true,execute:async(f,r,work)=>{request=r;return (await work()).evidence;},openDriver:async()=>{opened++;return {read:async()=>({status:'ready',rows:[],total:0,selectedGroup:'组A',groupReadback:true}),close:async()=>{}};}};
 await assert.rejects(readFavorites(args,deps),/同组/);assert.equal(opened,0);
 updateTask(file,s=>{s.operations=[{operationId:'write-one',kind:'favorite',status:'unknown',payload:{group:'组A'},evidence:{saved:true}}];return s;});await assert.rejects(readFavorites(args,deps),/同组/);
 updateTask(file,s=>{s.operations[0].status='completed';return s;});await assert.rejects(readFavorites({...args,group:'组B'},deps),/同组/);
 await readFavorites(args,deps);assert.equal(opened,1);assert.equal(request.payload.afterOperationId,'write-one');assert.equal(request.payload.limit,10);
});

test('favorites navigation waits beyond three seconds for the collection before selecting the group, without another navigation click',async()=>{
 const {readFavoritesView,inspectFavoritesEntry,inspectFavoriteGroupEntry}=await import('../lib/favorites-list.js');let reads=0,navigationClicks=0,groupClicks=0;
 const page={evaluate:async fn=>{if(fn===inspectFavoritesEntry)return '#favorites';if(fn===inspectFavoriteGroupEntry)return '#group';reads++;if(!navigationClicks)return {status:'not_favorites'};if(reads<18)return {status:'loading'};return {status:'ready',total:0,rows:[],groupReadback:true,selectedGroup:groupClicks?'目标组':'我的收藏'};}};
 const r=await readFavoritesView(page,10,{group:'目标组',pause:async()=>{},click:async s=>{if(s==='#favorites')navigationClicks++;else if(s==='#group')groupClicks++;else assert.fail('unexpected click');}});
 assert.equal(r.status,'ready');assert.equal(r.selectedGroup,'目标组');assert.equal(navigationClicks,1);assert.equal(groupClicks,1);assert.ok(reads<=34);
});
test('loading timeout preserves its stage in the durable failure evidence',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'favorite-timeout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file);let outcome;
 await assert.rejects(readFavorites({file,page:'1',group:'目标组',limit:10,operationId:'timeout'}, {validatePage:()=>true,execute:async(f,r,work)=>{outcome=await work();return outcome.evidence;},openDriver:async()=>({read:async()=>({status:'loading',readbackFailure:{stage:'favorites-entry',polls:32}}),close:async()=>{}})}),/loading/);
 assert.equal(outcome.status,'blocked');assert.equal(outcome.evidence.reason,'loading');assert.deepEqual(outcome.evidence.readbackFailure,{stage:'favorites-entry',polls:32});
});

test('stale root collection count does not prevent selecting the requested group; target group still requires its own readback',async()=>{
 const {readFavoritesView,inspectFavoriteGroupEntry}=await import('../lib/favorites-list.js');let clicks=0,pauses=0;
 const page={evaluate:async fn=>fn===inspectFavoriteGroupEntry?'#observed-group':clicks?{status:'ready',selectedGroup:'目标组',groupReadback:true,total:11,rows:[]}:{status:'loading',reason:'selected_count_mismatch',selectedGroup:'我的收藏',selectedCount:10,total:11}};
 const r=await readFavoritesView(page,20,{group:'目标组',pause:async()=>{pauses++;},click:async selector=>{assert.equal(selector,'#observed-group');clicks++;}});
 assert.equal(r.status,'ready');assert.equal(r.selectedGroup,'目标组');assert.equal(r.total,11);assert.equal(clicks,1);assert.equal(pauses,1);assert.deepEqual(r.navigationEvidence,{reason:'selected_count_mismatch',fromGroup:'我的收藏',selectedCount:10,total:11});
});
