import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nextPage} from '../lib/workflow.mjs';
import {initializeWorkflow} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/workflow.js';
import {readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';

const row=(page,name)=>({name:name??('合成'+page),summary:'合成卡片'+page,cardSelector:'#card'+page,
 detailTarget:'#name'+page,experience:'5年',detailLinks:[],rowClassResumeId:'res'+page,page});
const client={verify:async()=>{},tab:id=>({id,url:async()=>'https://h.liepin.com/search/getConditionItem'})};

function fixture(t,maxOperations=4){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-nextpage-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'task.json'),confirmedAt=new Date().toISOString();
 initializeWorkflow(file,{title:'合成翻页',criteria:[{id:'skill',label:'项目经验',category:'skills',kind:'required',weight:1}],
  rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成',pages:2,limit:10}}]});
 createSiteScope(file+'.scope',{label:'synthetic',maxOperations,confirmedAt});
 bindSiteScope(file,file+'.scope');
 authorizeTask(file,{allowedKinds:['page'],maxOperations,confirmedAt,scope:'synthetic next page',
  allowedRequests:[{kind:'page',payload:{tab_id:'123'}}]});
 return file;
}

test('one page advance saves the new page without submitting a query again',async t=>{
 const file=fixture(t);
 let calls=0;const clicked=[];
 const driver={click:async s=>clicked.push(s),evaluate:async()=>{
  calls+=1;
  return calls===1
   ?{pagination:{current:1,next:'#next',totalPages:3},rows:[row(1,'甲')],count:10}
   :{pagination:{current:2,next:'#next',totalPages:3},rows:[row(2,'乙')],count:10};
 }};
 const evidence=await nextPage(client,{file,operation_id:'page-1',tab_id:'123'},{openDriver:async()=>driver});
 assert.deepEqual(clicked,['#next']);
 assert.equal(evidence.page,2);
 assert.equal(evidence.count,1);
 const saved=readTask(file);
 assert.equal(saved.mcpSearch.currentPage,2);
 assert.deepEqual(saved.mcpSearch.rows.map(r=>r.name),['乙']);
 // The paged rows carry the same identity resolution as the first page.
 assert.equal((saved.unlinkedObservations??[]).length,0);
 assert.equal((saved.candidates??[]).length,1);
 assert.equal(saved.candidates[0].identity,'res2');
 assert.equal(saved.operations.find(o=>o.operationId==='page-1').status,'completed');
});

test('a click that does not move the page is reported instead of saving rows',async t=>{
 const file=fixture(t);
 const driver={click:async()=>{},evaluate:async()=>({pagination:{current:1,next:'#next'},rows:[row(1,'甲')],count:10})};
 await assert.rejects(nextPage(client,{file,operation_id:'page-2',tab_id:'123'},{openDriver:async()=>driver}),
  /翻页后页码与首行均未变化/);
 const saved=readTask(file);
 assert.equal(saved.mcpSearch,undefined);
 assert.notEqual(saved.operations.find(o=>o.operationId==='page-2').status,'completed');
});

test('a page without a next control is not clicked',async t=>{
 const file=fixture(t);
 let clicks=0;
 const driver={click:async()=>{clicks++;},evaluate:async()=>({pagination:{current:1,next:null},rows:[row(1,'甲')],count:10})};
 await assert.rejects(nextPage(client,{file,operation_id:'page-3',tab_id:'123'},{openDriver:async()=>driver}),
  /没有下一页控件/);
 assert.equal(clicks,0);
});
