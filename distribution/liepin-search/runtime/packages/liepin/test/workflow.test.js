import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runTaskCommand} from '../task.js';
import {readTask,updateTask} from '../lib/task-store.js';
import {validatePlan,approveRound,reviewTrial,runRound,importCandidates,proposeRevision} from '../lib/workflow.js';
import {beginOperation} from '../lib/operation-gate.js';
import {createSiteScope,bindSiteScope} from '../lib/site-scope.js';
import {runSearchCommand,searchCli} from '../search.js';
import {renderReport,taskSummary} from '../lib/report.js';
const plan={title:'测试岗位',criteria:[{id:'js',label:'JavaScript 项目经验',category:'skills',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'工程师',pages:1,limit:5}},{id:'full',phase:'full',filters:{keyword:'开发工程师',pages:2,limit:10}}]};
function fixture(t,{scopeFile,bind=true}={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-workflow-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json'),input=path.join(dir,'plan.json');fs.writeFileSync(input,JSON.stringify(plan));runTaskCommand({mode:'init',file,input});if(bind){if(!scopeFile){scopeFile=path.join(dir,'scope.json');createSiteScope(scopeFile,{label:'合成搜索范围',maxOperations:3,confirmedAt:new Date().toISOString()});}bindSiteScope(file,scopeFile);}return {dir,file,scopeFile};}
test('actual offline task command initializes and imports without browser access',t=>{
 const {dir,file}=fixture(t);const input=path.join(dir,'rows.json');fs.writeFileSync(input,JSON.stringify([{resumeId:'synthetic',name:'示例'}]));
 runTaskCommand({mode:'import',file,input,source:'liepin',roundId:'manual',stage:'list'});
 const result=runTaskCommand({mode:'show',file});assert.equal(result.candidates.length,1);assert.equal(result.rounds.length,2);
 assert.throws(()=>runTaskCommand({mode:'init',file,input}),/职位/);
});
test('trial to full uses saved evidence; a repeated round never searches again',async t=>{
 const {file}=fixture(t);const authorization={confirmedAt:new Date().toISOString(),scope:'合成任务范围'};let calls=0;
 const search=async()=>{calls++;return {status:'completed',rows:[{source:'liepin',resumeId:'same',text:'合成经历'}],evidence:{total:1}};};
 approveRound(file,'trial',authorization);await runRound(file,'trial',search);await runRound(file,'trial',search);
 assert.equal(calls,1);assert.equal(readTask(file).candidates[0].observations.length,1);
 reviewTrial(file,{decision:'proceed',notes:'合成结果已人工核对',reviewedAt:authorization.confirmedAt});
 approveRound(file,'full',authorization);await runRound(file,'full',search);
 assert.equal(calls,2);assert.equal(readTask(file).candidates.length,1);assert.equal(readTask(file).candidates[0].observations.length,2);
});
test('changed trial evidence invalidates previous formal-round approval',async t=>{
 const {file}=fixture(t);const authorization={confirmedAt:new Date().toISOString(),scope:'合成任务范围'};
 approveRound(file,'trial',authorization);await runRound(file,'trial',async()=>({status:'completed',rows:[],evidence:{total:0}}));
 reviewTrial(file,{decision:'proceed',notes:'已核对空结果',reviewedAt:authorization.confirmedAt});approveRound(file,'full',authorization);
 importCandidates(file,[{resumeId:'new'}],{source:'liepin',stage:'list',roundId:'trial'});
 let calls=0;await assert.rejects(runRound(file,'full',async()=>{calls++;}),/证据已变化/);assert.equal(calls,0);
});
test('partial blocked results are retained and a new invocation cannot rerun',async t=>{
 const {file}=fixture(t);approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'合成任务范围'});let calls=0;
 const search=async()=>{calls++;return {status:'blocked',rows:[{source:'liepin',resumeId:'first-page'}],evidence:{reason:'captcha'}};};
 await runRound(file,'trial',search);assert.equal(readTask(file).status,'paused');assert.equal(readTask(file).candidates.length,1);
 await assert.rejects(runRound(file,'trial',search));assert.equal(calls,1);
});
test('rejects invalid filters, duplicate rounds and unsupported evaluation categories',()=>{
 for(const input of [{...plan,criteria:[{...plan.criteria[0],category:'gender'}]},{...plan,rounds:[plan.rounds[0],plan.rounds[0]]},{...plan,rounds:[{...plan.rounds[0],filters:{keyword:'x',pages:11}}]}])assert.throws(()=>validatePlan(input));
});
test('trial authorization binds actual filters; formal round requires review',t=>{
 const {file}=fixture(t);const authorization={confirmedAt:new Date().toISOString(),scope:'一次试搜'};
 approveRound(file,'trial',authorization);
 assert.throws(()=>beginOperation(file,{operationId:'wrong',kind:'search',payload:plan.rounds[1].filters}),/范围/);
 assert.throws(()=>approveRound(file,'full',authorization),/复核/);
 assert.throws(()=>reviewTrial(file,{decision:'proceed',notes:'测试',reviewedAt:authorization.confirmedAt}),/尚无完成/);
 assert.equal(readTask(file).operations.length,0);
});
test('search refuses an unbound task before invoking the browser driver',async t=>{
 const {file}=fixture(t,{bind:false});approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'一次试搜'});
 await assert.rejects(runRound(file,'trial',async()=>{assert.fail('must not connect');}),/绑定共用站点范围/);
 assert.equal(readTask(file).operations.length,0);
});
test('search command preserves unidentified cards separately and reuses completed results',async t=>{
 const {file}=fixture(t);approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'一次合成搜索'});
 let opened=0,submitted=false,value='';
 const driver={click:async s=>{if(s==='#submit')submitted=true;},fillText:async(s,v)=>{value=v;},evaluate:async(fn,r)=>{
  const base={url:'https://h.liepin.com/search/getConditionItem',blank:false};
  if(r.mode==='controls')return {...base,submit:'#submit'};
  if(r.mode==='results')return {...base,count:submitted?2:0,rows:submitted?[{name:'同**'},{name:'同**'}]:[]};
  return {...base,target:'#keyword',value};
 }};
 const args={file,roundId:'trial',page:'A'.repeat(32)},options={openDriver:async()=>{opened++;return driver;},pause:async()=>{}};
 const result=await runSearchCommand(args,options);await runSearchCommand(args,options);
 assert.equal(opened,1);assert.equal(result.candidates.length,0);assert.equal(result.unlinkedObservations.length,2);
 assert.equal(taskSummary(result).unresolvedIdentities,2);
 for(const format of ['json','csv','html','markdown'])assert.match(renderReport(result,format),/unresolved|未识别/);
});
test('a search interrupted after dispatch pauses other tasks sharing the site scope',async t=>{
 const first=fixture(t),second=fixture(t,{scopeFile:first.scopeFile});
 for(const file of [first.file,second.file])approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'合成断连测试'});
 await assert.rejects(runRound(first.file,'trial',async()=>{throw new Error('command_result_unknown');}));
 assert.equal(readTask(first.scopeFile).status,'paused');
 await assert.rejects(runRound(second.file,'trial',async()=>{assert.fail('must not connect');}),/站点范围已暂停/);
 assert.equal(readTask(first.scopeFile).operations.length,1);
 assert.equal(readTask(second.file).operations[0].evidence.browserStarted,false);
});

test('search factory failure records a known preflight failure and does not retry',async t=>{
 const {file,scopeFile}=fixture(t);
 approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'一次试搜'});
 let opened=0;
 const args={file,roundId:'trial',page:'A'.repeat(32)};
 const options={openDriver:async()=>{opened++;throw new Error('已绑定目标为空白页');}};
 const result=await runSearchCommand(args,options);
 assert.equal(result.status,'paused');
 assert.equal(result.operations[0].status,'failed');
 assert.equal(result.operations[0].evidence.reason,'search_preflight_failed');
 assert.equal(result.operations[0].evidence.businessActionStarted,false);
 assert.equal(result.rounds[0].status,'interrupted');
 assert.equal(readTask(scopeFile).status,'paused');
 await assert.rejects(runSearchCommand(args,options));
 assert.equal(opened,1);
});

test('CLI reports a failed preflight as an error after preserving the stopped task',async t=>{
 const {file}=fixture(t);
 approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'一次试搜'});
 await assert.rejects(searchCli({file,roundId:'trial',page:'A'.repeat(32)},
  {openDriver:async()=>{throw new Error('about:blank');}}),
  error=>error.code==='SEARCH_STOPPED' && /不要自动重试/.test(error.message));
 assert.equal(readTask(file).operations[0].status,'failed');
});

test('page checkpoint is on disk before next click; disconnect preserves rows and stops the scope',async t=>{
 const {file,scopeFile}=fixture(t);
 updateTask(file,task=>{task.rounds[0].filters.pages=2;return task;});
 approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'合成两页试搜'});
 let submitted=false,nextClicks=0,value='';
 const driver={
  click:async selector=>{
   if(selector==='#submit')submitted=true;
   if(selector==='#next'){
    nextClicks++;
    const saved=readTask(file);
    assert.equal(saved.unlinkedObservations.length,1);
    assert.equal(saved.rounds[0].checkpoint.pages,1);
    assert.equal(saved.operations[0].status,'started');
    throw new Error('transport disconnected after next click');
   }
  },
  fillText:async(selector,text)=>{value=text;},
  evaluate:async(fn,request)=>{
   const base={url:'https://h.liepin.com/search/getConditionItem',blank:false};
   if(request.mode==='controls')return {...base,submit:'#submit'};
   if(request.mode==='results')return {...base,count:submitted?1:0,rows:submitted?[{name:'合成**'}]:[],pagination:{current:1,next:'#next',totalPages:2}};
   return {...base,target:'#keyword',value};
  },
 };
 const args={file,roundId:'trial',page:'A'.repeat(32)},options={openDriver:async()=>driver,pause:async()=>{}};
 const result=await runSearchCommand(args,options);
 assert.equal(result.status,'paused');assert.equal(result.operations[0].status,'unknown');
 assert.equal(result.unlinkedObservations.length,1);
 assert.equal(result.rounds[0].resultCount,1);
 assert.equal(result.rounds[0].status,'interrupted');
 assert.equal(readTask(scopeFile).status,'paused');
 await assert.rejects(runSearchCommand(args,options));assert.equal(nextClicks,1);
});


test('plans preserve explicitly stated job-related exclusion criteria',()=>{
 const input=structuredClone(plan);
 input.criteria.push({id:'conflict',label:'已确认的岗位利益冲突',category:'responsibilities',kind:'exclusion',weight:1});
 assert.equal(validatePlan(input).criteria.at(-1).kind,'exclusion');
 input.criteria.at(-1).kind='automatic-rejection';
 assert.throws(()=>validatePlan(input),/类型/);
});


test('revision preserves old evidence, supersedes unused rounds and requires fresh approval and review',async t=>{
 const {file,scopeFile}=fixture(t);
 const authorization={confirmedAt:new Date().toISOString(),scope:'合成试搜'};
 approveRound(file,'trial',authorization);
 await runRound(file,'trial',async()=>({status:'completed',rows:[{source:'liepin',resumeId:'first'}],evidence:{total:1}}));
 reviewTrial(file,{decision:'revise',notes:'关键词偏窄，提出新方案供确认',reviewedAt:authorization.confirmedAt});
 const before=readTask(file),scopeBefore=readTask(scopeFile);
 const proposal={reason:'更换关键词并复核',proposedBy:'合成审阅者',proposedAt:authorization.confirmedAt,rounds:[
  {id:'trial-v2',phase:'trial',filters:{keyword:'前端开发',limit:5,pages:1}},
  {id:'full-v2',phase:'full',filters:{keyword:'JavaScript 开发',limit:5,pages:1}},
 ]};
 const revised=proposeRevision(file,proposal);
 assert.deepEqual(revised.candidates,before.candidates);assert.deepEqual(revised.operations,before.operations);
 assert.deepEqual(revised.policy,before.policy);assert.deepEqual(readTask(scopeFile),scopeBefore);
 assert.equal(revised.rounds.find(r=>r.id==='full').status,'superseded');
 await assert.rejects(runRound(file,'trial-v2',()=>assert.fail('unapproved')),/授权/);
 assert.throws(()=>approveRound(file,'full-v2',authorization),/复核/);
 approveRound(file,'trial-v2',authorization);
 assert.equal(readTask(file).policy.maxOperations,before.policy.maxOperations+1);
 await runRound(file,'trial-v2',async()=>({status:'completed',rows:[{source:'liepin',resumeId:'first'}],evidence:{total:1}}));
 assert.equal(readTask(file).candidates.length,1);
 assert.equal(readTask(file).candidates[0].observations.length,2);
 reviewTrial(file,{decision:'proceed',notes:'新版试搜已复核',reviewedAt:authorization.confirmedAt});
 approveRound(file,'full-v2',authorization);
 assert.throws(()=>approveRound(file,'full',authorization),/已授权/);
});

test('revision rejects reused IDs, repeated searches and stale evidence without modifying the task',async t=>{
 const {file}=fixture(t);const now=new Date().toISOString();
 approveRound(file,'trial',{confirmedAt:now,scope:'合成试搜'});
 await runRound(file,'trial',async()=>({status:'completed',rows:[],evidence:{total:0}}));
 reviewTrial(file,{decision:'revise',notes:'调整计划',reviewedAt:now});
 const base={reason:'测试修订',proposedBy:'测试',proposedAt:now};
 const before=readTask(file);
 assert.throws(()=>proposeRevision(file,{...base,rounds:[{...plan.rounds[0],filters:{keyword:'新词'}}]}),/新的 ID/);
 assert.throws(()=>proposeRevision(file,{...base,rounds:[{...plan.rounds[0],id:'new'}]}),/重复/);
 assert.deepEqual(readTask(file),before);
 importCandidates(file,[{resumeId:'later'}],{source:'liepin',stage:'list',roundId:'trial'});
 assert.throws(()=>proposeRevision(file,{...base,rounds:[{id:'new',phase:'trial',filters:{keyword:'新词'}}]}),/当前试搜证据/);
});
