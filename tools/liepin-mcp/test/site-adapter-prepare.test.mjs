import {coreFilters,adapterFilterProperties} from '../lib/site-adapter-filters.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareAdapterFilters} from '../lib/site-adapter-prepare.mjs';
import {createTask,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {authorizeTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
function fixture(t,authorized=true){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-prepare-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'task.json'),scope=path.join(root,'scope.json'),confirmedAt=new Date().toISOString();createTask(file);
 createSiteScope(scope,{label:'synthetic',maxOperations:2,confirmedAt});bindSiteScope(file,scope);
 const args={file,operation_id:'prepare-one',tab_id:'123',filters:{keyword:'合成'}};
 if(authorized)authorizeTask(file,{allowedKinds:['prepare'],maxOperations:2,confirmedAt,scope:'synthetic',allowedRequests:[{kind:'prepare',payload:{page:args.tab_id,filters:args.filters}}]});
 return args;
}
test('official adapter prepare persists readback and completed calls do not touch the tab twice',async t=>{
 const args=fixture(t);let reads=0,applies=0;const tab={id:'123',url:async()=>{reads++;return 'https://h.liepin.com/search/getConditionItem';}};
 const apply=async(driver,filters,options)=>{applies++;assert.equal(options.submit,false);options.onFilterProgress({applied:filters});return {applied:filters};};
 const result=await prepareAdapterFilters({args,tab},{apply});assert.equal(result.submitted,false);assert.deepEqual(result.applied,args.filters);
 await prepareAdapterFilters({args,tab},{apply});assert.equal(reads,1);assert.equal(applies,1);assert.equal(readTask(args.file).operations[0].filterProgress.verification,'control-readback');
});
test('missing scope authorization and wrong tab are rejected before page reads',async t=>{
 const args=fixture(t,false),tab={id:'123',url:async()=>assert.fail('no page read')};
 await assert.rejects(prepareAdapterFilters({args,tab}));
 await assert.rejects(prepareAdapterFilters({args,tab:{...tab,id:'456'}}),/绑定的页面/);
 assert.equal((readTask(args.file).operations??[]).length,0);
});
test('cancellation after dispatch retains unknown and blocks further writes',async t=>{
 const args=fixture(t),controller=new AbortController();let writes=0;
 const tab={id:'123',url:async()=> 'https://h.liepin.com/search/getConditionItem',act:async()=>{writes++;controller.abort();return {};}};
 await assert.rejects(prepareAdapterFilters({args,tab,signal:controller.signal},{apply:async driver=>{await driver.fillText('#synthetic','value');await driver.click('#next');}}),/取消/);
 assert.equal(writes,1);assert.equal(readTask(args.file).operations[0].status,'unknown');
});

test('official snake_case filter schema maps all 30 fields without changing core keys',()=>{
 assert.equal(Object.keys(adapterFilterProperties).length,30);
 assert.ok(Object.keys(adapterFilterProperties).every(key=>/^[a-z][a-z0-9_]*$/.test(key)));
 assert.deepEqual(coreFilters({expected_city:'上海',age_min:'25'}),{expectedCity:'上海',ageMin:'25'});
 assert.throws(()=>coreFilters({expectedCity:'上海'}),/未知/);
});
test('verify-only reads a paused task without writes or implicit reconciliation',async t=>{
 const args=fixture(t,false);args.verify_only=true;args.filters={resume_language:'中文简历'};
 const saved=JSON.parse(fs.readFileSync(args.file));saved.status='paused';fs.writeFileSync(args.file,JSON.stringify(saved));
 const before=fs.readFileSync(args.file,'utf8');let reads=0;
 const url='https://h.liepin.com/search/getConditionItem';
 const result=await prepareAdapterFilters({args,tab:{id:'123',url:async()=>url,
  evaluate:async(_fn,{arg})=>{reads++;assert.equal(arg.expectedUrl,url);return {url,...(arg.mode==='selection-summary'?{selected:[{title:'简历语言',text:'中文简历'}]}:{committed:true,selectionTexts:['中文简历']})};},
  act:async()=>assert.fail('readback must not dispatch actions')}});
 assert.equal(reads,2);assert.equal(result.readOnly,true);assert.equal(result.fields[0].committed,true);
 assert.equal(result.selectedSummary[0].text,'中文简历');assert.equal(fs.readFileSync(args.file,'utf8'),before);
});
test('verify-only stops on a risk surface before further reads',async t=>{
 const args=fixture(t,false);args.verify_only=true;let reads=0;
 await assert.rejects(prepareAdapterFilters({args,tab:{id:'123',url:async()=> 'https://h.liepin.com/search/getConditionItem',
  evaluate:async()=>{reads++;return {risk:true};},act:async()=>assert.fail('no actions')}}),/不适合核对/);
 assert.equal(reads,1);
});
test('option discovery journals opening and closing the menu without selecting a value',async t=>{
 const args={...fixture(t,false),filters:{full_time:'仅作观察定位'},options_only:true};
 authorizeTask(args.file,{allowedKinds:['inspect'],maxOperations:1,confirmedAt:new Date().toISOString(),scope:'synthetic option discovery',allowedRequests:[{kind:'inspect',payload:{view:'filter-options',page:'123',filters:{fullTime:'仅作观察定位'}}}]});
 let open=false;const actions=[];const createDriver=()=>({evaluate:async()=>({url:'https://h.liepin.com/search/getConditionItem',activationTarget:'#select',dropdownOptions:open?['不限','统招']:[]}),click:async s=>{actions.push(s);open=true;},pressKey:async key=>{actions.push(key);open=false;}});
 const context={args,tab:{id:'123',url:async()=> 'https://h.liepin.com/search/getConditionItem'}};
 const result=await prepareAdapterFilters(context,{createDriver,pause:async()=>{}});assert.deepEqual(result.fields[0].options,['不限','统招']);assert.equal(result.selectionChanged,false);assert.equal(result.searchSubmitted,false);assert.deepEqual(actions,['#select','Escape']);
 await prepareAdapterFilters(context,{createDriver,pause:async()=>{}});assert.equal(actions.length,2);
});
test('option discovery without matching authorization never opens a menu',async t=>{
 const args={...fixture(t),filters:{full_time:'统招'},options_only:true};let calls=0;
 await assert.rejects(prepareAdapterFilters({args,tab:{id:'123',url:async()=>{calls++;return '';}}},{createDriver:()=>{calls++;}}));assert.equal(calls,0);
});
