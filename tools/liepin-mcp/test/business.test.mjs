import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepare,savedSearch,favorite,favorites} from '../lib/business.mjs';
import {createTask,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
function fixture(t,kind,payload){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-business-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),confirmedAt=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'synthetic',maxOperations:3,confirmedAt});bindSiteScope(file,scope);
 if(kind)authorizeTask(file,{allowedKinds:[kind],allowedRequests:[{kind,payload}],maxOperations:3,scope:'synthetic',confirmedAt});
 return {file,operation_id:'one',tab_id:'123'};
}
function client(url,observe){
 let connections=0,reads=0;
 return {verify:async()=>{connections++;},tab:id=>{assert.equal(id,'123');return {url:async()=>url,evaluate:async(fn,{arg})=>{reads++;return observe(fn,arg);},act:()=>assert.fail('unexpected click'),close:()=>assert.fail('must not close bound user page')};},counts:()=>({connections,reads})};
}
test('MCP saved-search list uses numeric tab binding and shared completed evidence',async t=>{
 const args=fixture(t,'inspect',{action:'list',page:'123'}),url='https://h.liepin.com/search/getConditionItem';
 const c=client(url,()=>({url,schemes:[{name:'合成方案',subscribed:false}]}));
 const result=await savedSearch(c,{...args,action:'list'});assert.equal(result.schemes[0].name,'合成方案');
 await savedSearch(c,{...args,action:'list'});assert.deepEqual(c.counts(),{connections:1,reads:1});
 assert.equal(readTask(args.file).operations[0].status,'completed');
});
test('MCP favorite status verifies detail identity without clicking',async t=>{
 const resume_id='synthetic-id',args=fixture(t,'inspect',{resumeId:resume_id,page:'123',action:'status'});
 const c=client('https://h.liepin.com/resume/showresumedetail/?res_id_encode='+resume_id,()=>({known:true,saved:true}));
 const result=await favorite(c,{...args,action:'status',resume_id});assert.equal(result.saved,true);assert.equal(result.changed,false);
 const events=readTask(args.file).events;assert.ok(events.some(e=>e.phase==='observed'&&e.description==='回读收藏状态：已收藏'));
 assert.ok(events.every(e=>e.operationId==='one'&&e.tabId==='123'));
});
test('MCP favorite rejects mismatched detail before reading or clicking',async t=>{
 const args=fixture(t,'inspect',{resumeId:'expected',page:'123',action:'status'});
 const c=client('https://h.liepin.com/resume/showresumedetail/?res_id_encode=other',()=>assert.fail());
 await assert.rejects(favorite(c,{...args,action:'status',resume_id:'expected'}),/不符/);
 assert.equal(c.counts().reads,0);assert.equal(readTask(args.file).operations[0].status,'unknown');
});
test('MCP favorites persists original visible card and does not close the bound page',async t=>{
 const args=fixture(t,'inspect',{view:'favorites',page:'123',limit:2});
 const c=client('https://h.liepin.com/resumemanage/showmytalentlist',()=>({status:'ready',total:1,rows:[{summary:'合成收藏卡片',savedAt:'2026-10-20',detailLinks:[]}]}));
 const result=await favorites(c,{...args,limit:2});assert.equal(result.rows[0].source,'liepin');
 assert.equal(readTask(args.file).unlinkedObservations.length,1);
});
for(const [name,run,args] of [
 ['prepare',prepare,{filters:{keyword:'合成'}}],['saved-search',savedSearch,{action:'list'}],
 ['favorite',favorite,{action:'status',resume_id:'synthetic'}],['favorites',favorites,{}],
])test(`${name} fails without scope authorization before connecting`,async t=>{
 const bound=fixture(t);let connections=0;await assert.rejects(run({verify:()=>{connections++;throw Error('unexpected connection');}},{...bound,...args}));
 assert.equal(connections,0);assert.equal((readTask(bound.file).operations??[]).length,0);
});
test('cancellation during scheme observation preserves unknown and prevents replay',async t=>{
 const args=fixture(t,'inspect',{action:'list',page:'123'}),url='https://h.liepin.com/search/getConditionItem',controller=new AbortController();
 const c=client(url,()=>{controller.abort();return {url,schemes:[]};});
 await assert.rejects(savedSearch(c,{...args,action:'list'},{signal:controller.signal}),/取消/);
 assert.equal(readTask(args.file).operations[0].status,'unknown');
 await assert.rejects(savedSearch(c,{...args,action:'list'}));assert.equal(c.counts().reads,1);
});

test('Site Adapter scheme apply preserves rows and metadata when replaying a completed receipt',async t=>{
 const {adapterSavedSearch}=await import('../lib/site-adapter-business.mjs');
 const {executeScopedOperation}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
 const payload={action:'apply',page:'123',name:'合成方案',limit:2};
 const args=fixture(t,'apply-search',payload);
 const evidence={name:'合成方案',total:20,rows:[{source:'liepin',resumeId:'fixture',summary:'合成卡片'}]};
 await executeScopedOperation(args.file,{operationId:args.operation_id,kind:'apply-search',payload},async()=>({status:'completed',evidence}));
 const result=await adapterSavedSearch({args:{...args,action:'apply',name:'合成方案',limit:2},tab:{id:'123',url:()=>assert.fail('completed receipt must not navigate or read')}});
 assert.deepEqual(result,{snapshot:evidence});assert.equal(result.rows,undefined);
 assert.equal(readTask(args.file).mcpSearch.rows.length,1);
 assert.equal(readTask(args.file).operations.length,1);
});
for(const empty of [false,true])test(`Site Adapter favorites keeps total and typed snapshot, empty=${empty}`,async t=>{
 const {adapterFavorites}=await import('../lib/site-adapter-business.mjs');
 const args=fixture(t,'inspect',{view:'favorites',page:'123',limit:2});let reads=0;
 const context={args:{...args,limit:2},tab:{id:'123',url:async()=> 'https://h.liepin.com/resumemanage/showmytalentlist',evaluate:async()=>{reads++;return {status:'ready',total:empty?0:5,rows:empty?[]:[{summary:'合成收藏',detailLinks:[]}]};},act:()=>assert.fail('read only')}};
 const first=await adapterFavorites(context),second=await adapterFavorites(context);
 assert.deepEqual(first,second);assert.equal(reads,1);assert.equal(first.rows,undefined);
 assert.equal(first.snapshot.collection,'favorites');assert.equal(first.snapshot.total,empty?0:5);assert.equal(first.snapshot.rows.length,empty?0:1);
});

test('favorite native action persists named intent and operation context before blocked dispatch',async t=>{
 const resume_id='synthetic-id',args=fixture(t,'favorite',{resumeId:resume_id,page:'123',action:'add',group:'private-group'});
 const c=client('https://h.liepin.com/resume/showresumedetail/?res_id_encode='+resume_id,fn=>fn.name==='inspectFavorite'?{known:true,saved:false,button:'#favorite'}:{ok:false,reason:'target_unavailable'});
 await assert.rejects(favorite(c,{...args,action:'add',resume_id,group:'private-group'}));
 const events=readTask(args.file).events;
 assert.ok(events.some(e=>e.phase==='planned'&&e.description.includes('收藏')));
 assert.ok(events.every(e=>e.operationId==='one'&&e.tabId==='123'));
 assert.ok(!JSON.stringify(events).includes('private-group'));
 assert.ok(!events.some(e=>e.phase==='verified'));
});
for(const outcome of ['ready','blocked','wrong_url'])test(`independent favorites workspace cleans up and preserves parent: ${outcome}`,async t=>{
 const {adapterFavorites}=await import('../lib/site-adapter-business.mjs');
 const args=fixture(t,'inspect',{view:'favorites',page:'123',limit:2,group:'合成组',workspace:true});
 const actions=[];let reads=0;
 const child={id:'456',url:async()=>outcome==='wrong_url'?'https://example.test/':'https://h.liepin.com/resumemanage/showmytalentlist',evaluate:async()=>{reads++;return {status:outcome,total:1,rows:[{summary:'合成收藏',detailLinks:[]}],groupReadback:true,selectedGroup:'合成组'};},act:()=>assert.fail('already selected group needs no click')};
 const context={args:{...args,limit:2,group:'合成组',workspace:true},tab:{id:'123',url:()=>assert.fail('must preserve parent'),goto:()=>assert.fail('must preserve parent'),close:()=>assert.fail('must preserve parent')},tabs:{openFavorites:async()=>{actions.push('open');return child;},closeChild:async id=>{assert.equal(id,'456');actions.push('close');},returnToParent:async()=>actions.push('return'),opened:()=>['456']}};
 if(outcome==='ready'){
  const first=await adapterFavorites(context);assert.equal(first.snapshot.groupReadback,true);
  assert.deepEqual(await adapterFavorites(context),first);assert.equal(reads,1);
 }else await assert.rejects(adapterFavorites(context));
 assert.deepEqual(actions,['open','close','return']);
 const task=readTask(args.file);assert.equal(task.operations.length,1);
 assert.equal(task.operations[0].status,outcome==='ready'?'completed':outcome==='blocked'?'blocked':'unknown');
 assert.equal(task.unlinkedObservations?.length??0,0);
 if(outcome!=='wrong_url')assert.ok(task.events.some(e=>e.phase==='reading'&&e.tabId==='456'));
});
test('independent workspace requires its explicit request authorization before opening',async t=>{
 const {adapterFavorites}=await import('../lib/site-adapter-business.mjs');
 const args=fixture(t,'inspect',{view:'favorites',page:'123',limit:2});let opens=0;
 await assert.rejects(adapterFavorites({args:{...args,limit:2,workspace:true},tab:{id:'123'},tabs:{openFavorites:async()=>{opens++;throw Error('unexpected');}}}));
 assert.equal(opens,0);
});

test('MCP favorites forwards the mutation anchor into exact request authorization',async t=>{
 const {updateTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');
 const args=fixture(t,'inspect',{view:'favorites',page:'123',limit:2,group:'组A',afterOperationId:'add-one'});
 updateTask(args.file,s=>{s.operations.push({operationId:'add-one',kind:'favorite',status:'completed',payload:{group:'组A'},evidence:{saved:true}});return s;});
 const c=client('https://h.liepin.com/resumemanage/showmytalentlist',()=>({status:'ready',total:0,rows:[],selectedGroup:'组A',groupReadback:true}));
 await favorites(c,{...args,limit:2,group:'组A',after_operation_id:'add-one'});assert.equal(readTask(args.file).operations.find(o=>o.operationId==='one').payload.afterOperationId,'add-one');
});
