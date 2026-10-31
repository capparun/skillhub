import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {search,saveSearchPage} from '../lib/workflow.mjs';
import {initializeWorkflow,approveRound} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/workflow.js';
import {readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-pages-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'task.json'),confirmedAt=new Date().toISOString();
 initializeWorkflow(file,{title:'合成分页',criteria:[{id:'skill',label:'项目经验',category:'skills',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成',pages:2,limit:1}}]});
 createSiteScope(file+'.scope',{label:'synthetic',maxOperations:1,confirmedAt});bindSiteScope(file,file+'.scope');approveRound(file,'trial',{confirmedAt,scope:'synthetic two pages'});return file;
}
const row=page=>({name:'合成'+page,summary:'合成卡片'+page,cardSelector:'#card'+page,detailTarget:'#name'+page,page});
const client={verify:async()=>{},tab:id=>({id,url:async()=>'https://h.liepin.com/search/getConditionItem'})};
test('authorized pages are preserved before advancing and only final page is bound for index detail',async t=>{
 const file=fixture(t);let calls=0;
 const result=await search(client,{file,round_id:'trial',tab_id:'123'},{runSearch:async(driver,filters,{onPage})=>{
  calls++;assert.equal(filters.pages,2);await onPage({rows:[row(1)],currentRows:[row(1)],currentPage:1,pages:1,total:2});
  assert.equal(readTask(file).unlinkedObservations.length,1);
  await onPage({rows:[row(1),row(2)],currentRows:[row(2)],currentPage:2,pages:2,total:2});
  return {rows:[row(1),row(2)],pages:2,status:'completed',applied:[],total:2};
 }});
 assert.equal(result.pages,2);assert.equal(result.count,2);const saved=readTask(file);assert.equal(saved.unlinkedObservations.length,2);assert.deepEqual(saved.mcpSearch.rows.map(r=>r.page),[2]);
 await search({verify:()=>assert.fail('completed round must not reconnect')},{file,round_id:'trial',tab_id:'123'});assert.equal(calls,1);
});
test('empty current page never rebinds cards from an earlier page',t=>{
 const file=fixture(t);saveSearchPage(file,{rows:[row(1)],currentRows:[],currentPage:2},'trial','123');assert.deepEqual(readTask(file).mcpSearch.rows,[]);assert.equal(readTask(file).unlinkedObservations.length,1);
});
test('interrupted pagination retains confirmed pages and prohibits repeating the search',async t=>{
 const file=fixture(t);let calls=0;
 const result=await search(client,{file,round_id:'trial',tab_id:'123'},{runSearch:async(driver,filters,{onPage})=>{
  calls++;await onPage({rows:[row(1)],currentRows:[row(1)],currentPage:1,pages:1,total:2});
  return {rows:[row(1)],pages:1,status:'unknown',applied:[],total:2,warning:'合成翻页中断'};
 }});
 assert.equal(result.status,'interrupted');assert.equal(result.warning,'合成翻页中断');assert.equal(readTask(file).unlinkedObservations.length,1);
 let connections=0;await assert.rejects(search({verify:async()=>{connections++;}},{file,round_id:'trial',tab_id:'123'}));assert.equal(connections,0);assert.equal(calls,1);
});
