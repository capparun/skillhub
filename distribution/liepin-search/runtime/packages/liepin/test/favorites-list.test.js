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
 const context=vm.createContext({location:{origin:'https://h.liepin.com',pathname:'/resumemanage/showmytalentlist'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{body:{innerText:'共 310 份简历'},querySelectorAll:selector=>selector==='dl'?[card]:[element(heading)]}});
 const inspect=()=>vm.runInContext(`(${inspectFavorites.toString()})({limit:1})`,context);
 assert.equal(inspect().status,'not_favorites');heading='收藏的简历·Talent';
 const result=inspect();assert.equal(result.status,'ready');assert.equal(result.rows.length,1);assert.equal(result.rows[0].savedAt,'2026-10-12');assert.equal(result.rows[0].resumeId,undefined);
 context.document.body.innerText='共 310 份简历 安全验证';assert.equal(inspect().status,'blocked');
});
for(const blocked of [false,true])test(`favorites command persists and reuses evidence, blocked=${blocked}`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-favorites-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),now=new Date().toISOString(),page='A'.repeat(32);
 createTask(file);createSiteScope(scope,{label:'fixture',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 authorizeTask(file,{allowedKinds:['inspect'],maxOperations:1,confirmedAt:now,scope:'favorites fixture',allowedRequests:[{kind:'inspect',payload:{view:'favorites',page,limit:1}}]});
 let reads=0,closes=0;
 const options={openDriver:async()=>({read:async()=>{reads++;return blocked?{status:'not_favorites'}:{status:'ready',total:10,rows:[{summary:'合成收藏',detailLinks:[]}]};},close:async()=>{closes++;}})};
 const args={file,page,limit:1,operationId:'favorites-one'};
 if(blocked){await assert.rejects(readFavorites(args,options),/收藏列表未确认/);assert.equal(readTask(file).status,'paused');}
 else {await readFavorites(args,options);await readFavorites(args,options);const task=readTask(file);assert.equal(task.unlinkedObservations.length,1);assert.equal(task.unlinkedObservations[0].data.collection,'favorites');}
 assert.equal(reads,1);assert.equal(closes,1);
});
