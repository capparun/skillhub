import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {savedSearchTask} from '../lib/saved-search-task.js';
import {inspect} from '../lib/dom.js';
import {createTask,readTask} from '../lib/task-store.js';
import {authorizeTask} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
function setup(t,action){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-schemes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),page='A'.repeat(32),now=new Date().toISOString();
 createTask(file);createSiteScope(scope,{label:'fixture',maxOperations:1,confirmedAt:now});bindSiteScope(file,scope);
 const kind={list:'inspect',apply:'apply-search',delete:'delete-search'}[action];
 const payload={action,page,...(action==='list'?{}:{name:'合成方案'}),...(action==='apply'?{limit:1}:{})};
 authorizeTask(file,{allowedKinds:[kind],maxOperations:1,confirmedAt:now,scope:'fixture',allowedRequests:[{kind,payload}]});
 return {file,page,name:'合成方案',limit:1,operationId:'scheme-one'};
}
test('listing schemes is persisted and repeated operation does not access browser',async t=>{
 const args=setup(t,'list');let reads=0,closed=0;
 const options={openDriver:async()=>({evaluate:async()=>{reads++;return {schemes:[{name:'合成方案',subscribed:false}]};},close:async()=>closed++})};
 assert.equal((await savedSearchTask('list',args,options)).schemes.length,1);await savedSearchTask('list',args,options);assert.equal(reads,1);assert.equal(closed,1);
});
for(const changed of [true,false])test(`apply verifies fresh results and never clicks twice, changed=${changed}`,async t=>{
 const args=setup(t,'apply');let clicks=0,prepared=false;
 const options={pause:async()=>{},openDriver:async()=>({prepareResultObservation:async()=>{prepared=true;},evaluate:async fn=>{if(fn===inspect){assert.equal(prepared,true);return {count:1,total:1,rows:[{summary:clicks && changed?'new':'old'}]};}return {schemes:[{name:'合成方案',apply:'#scheme'}]};},click:async()=>{clicks++;},close:async()=>{}})};
 if(changed){const result=await savedSearchTask('apply',args,options);assert.equal(result.rows[0].summary,'new');assert.equal(readTask(args.file).unlinkedObservations.length,1);await savedSearchTask('apply',args,options);}
 else {await assert.rejects(savedSearchTask('apply',args,options),/没有确认新结果/);assert.equal(readTask(args.file).status,'paused');await assert.rejects(savedSearchTask('apply',args,options));}
 assert.equal(clicks,1);
});
test('deletion confirms once and verifies absence before reporting success',async t=>{
 const args=setup(t,'delete');let clicks=0;
 const states=[{schemes:[{name:'合成方案',remove:'#remove'}]},{schemes:[{name:'合成方案'}],dialog:{text:'确定删除该搜索条件吗',confirm:'#confirm'}},{schemes:[]}];
 const result=await savedSearchTask('delete',args,{pause:async()=>{},openDriver:async()=>({evaluate:async()=>states.shift(),click:async()=>{clicks++;},close:async()=>{}})});
 assert.equal(result.deleted,true);assert.equal(clicks,2);
});
for(const dialogOnly of [false,true])test(`save current preserves verification evidence and avoids replay; dialogOnly=${dialogOnly}`,async t=>{
 const args=setup(t,'list');
 const {grantOperations}=await import('../lib/operation-gate.js');
 grantOperations(args.file,{allowedRequests:[{kind:'save-search',payload:{action:'save',page:args.page,name:args.name,current:true}}],confirmedAt:new Date().toISOString(),scope:'save current fixture'});
 const clicks=[];let saved=false,dialog=false,reads=0;
 const options={pause:async()=>{},openDriver:async()=>({
  evaluate:async fn=>{reads++;return fn===inspect?{reset:'#reset',selectedEvidence:[{text:'3-5年'}],nonemptyInputs:[{value:'嵌入式开发',placeholder:'关键词'}]}:{saveButton:'#save',schemes:saved&&!dialogOnly?[{name:args.name}]:[],saveSuccess:saved&&dialogOnly,dialog:dialog?{input:'#name',confirm:'#confirm'}:null};},
  click:async selector=>{clicks.push(selector);if(selector==='#save')dialog=true;if(selector==='#confirm')saved=true;},
  fillText:async(selector,value)=>{assert.equal(selector,'#name');assert.equal(value,args.name);},close:async()=>{}
 })};
 const result=await savedSearchTask('save',{...args,current:true},options);
 assert.equal(result.saved,true);assert.equal(result.listVerified,!dialogOnly);assert.equal(result.verification,dialogOnly?'platform_success_dialog':'saved_scheme_list');assert.equal(result.inputConditions[0].value,'嵌入式开发');assert.equal(readTask(args.file).operations.at(-1).evidence.listVerified,!dialogOnly);assert.deepEqual(clicks,['#save','#name','#confirm']);assert.equal(result.selectedConditions[0].text,'3-5年');
 const before=reads;await savedSearchTask('save',{...args,current:true},options);assert.equal(reads,before);
 await assert.rejects(savedSearchTask('save',{...args,current:true,keyword:'x'},options),/混用/);
});
