import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createTask,readTask,updateTask,mergeObservations} from '../lib/task-store.js';
import {configureSourcing,recordSourcingDecision,sourcingProgress} from '../lib/sourcing-outcome.js';
import {recordEvaluation} from '../lib/evaluation.js';
import {runLocalTask} from '../lib/task-service.js';
function fixture(t,label='SQL数据分析'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sourcing-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');
 createTask(file,{criteria:[{id:'skill',label,kind:'required'},{id:'bonus',label:'行业经验',kind:'bonus'}]});
 updateTask(file,t=>mergeObservations(t,[{source:'liepin',resumeId:'synthetic',status:'partial',text:label}],{roundId:'one',stage:'detail'}));
 configureSourcing(file,{goal:'favorites',groups:['项目组'],confirmedBy:'测试用户',confirmedAt:new Date().toISOString(),authorization:'按已确认标准收藏值得跟进的人',stopCondition:'当前已批准首页处理完毕'});return file;
}
function evaluate(file,complete=true){const o=readTask(file).candidates[0].observations[0];recordEvaluation(file,{candidateKey:'liepin:synthetic',reviewer:'测试证据整理',reviewedAt:new Date().toISOString(),findings:[{criterionId:'skill',status:'supported',reason:'原文记载该技能',evidence:[{hash:o.hash,path:['text'],quote:o.data.text}]},...(complete?[{criterionId:'bonus',status:'unknown',reason:'可见资料未说明行业经历，需补问',evidence:[]}]:[])]});}
const decision={candidateKey:'liepin:synthetic',decision:'follow_up',reason:'存在岗位技能证据，可进入跟进池',gaps:['行业经历需补问'],group:'项目组',reviewer:'AI辅助整理'};
test('different JDs use same local workflow without browser and do not create favorites',t=>{for(const jd of ['SQL数据分析','机械结构设计']){const f=fixture(t,jd);evaluate(f);runLocalTask({file:f,mode:'sourcing-decision',input:decision});const p=runLocalTask({file:f,mode:'sourcing-progress'});assert.equal(p.counts.followUp,1);assert.equal(p.counts.favoriteConfirmed,0);assert.equal(p.complete,false);assert.equal(readTask(f).operations,undefined);}});
test('placeholder assessments and wrong groups cannot become follow-up decisions',t=>{const f=fixture(t);evaluate(f,false);assert.throws(()=>recordSourcingDecision(f,decision),/统一核对/);evaluate(f);assert.throws(()=>recordSourcingDecision(f,{...decision,group:'未批准组'}),/目标组/);});
test('explicit mandatory conflicts cannot be waived by a gap note or another supported criterion',t=>{
 for(const [kind,status] of [['required','contradicted'],['exclusion','supported']]){
  const f=fixture(t);
  updateTask(f,t=>{t.requirements.criteria[0].kind=kind;return t;});
  const configure=()=>configureSourcing(f,{goal:'favorites',groups:['项目组'],confirmedBy:'测试用户',confirmedAt:new Date().toISOString(),authorization:'按已确认标准跟进',stopCondition:'首页'});
  configure();
  const assess=()=>{
   const o=readTask(f).candidates[0].observations[0],evidence=[{hash:o.hash,path:['text'],quote:o.data.text}];
   recordEvaluation(f,{candidateKey:decision.candidateKey,reviewer:'测试',reviewedAt:new Date().toISOString(),findings:[
    {criterionId:'skill',status,reason:'合成门槛冲突',evidence},
    {criterionId:'bonus',status:'supported',reason:'另一条件有支持',evidence}]});
  };
  assess();
  assert.throws(()=>recordSourcingDecision(f,{...decision,gaps:['用户可能接受这一缺口']}),/明确硬门槛/);
  recordSourcingDecision(f,{...decision,decision:'clarify'});
  assert.equal(sourcingProgress(readTask(f)).counts.followUp,0);
  updateTask(f,t=>{t.sourcing.decisions.at(-1).decision='follow_up';return t;});
  assert.equal(sourcingProgress(readTask(f)).people[0].decisionStale,true,'legacy conflicting decisions must not remain executable');
  // A newly confirmed standard is needed, not a free-text bypass on one person.
  updateTask(f,t=>{t.requirements.criteria[0].kind='bonus';return t;});
  assert.throws(()=>recordSourcingDecision(f,decision),/标准/);
  configure();assess();recordSourcingDecision(f,decision);
  assert.equal(sourcingProgress(readTask(f)).counts.followUp,1);
 }
});
test('new evidence and standard revisions invalidate prior decision without deleting history',t=>{const f=fixture(t);evaluate(f);recordSourcingDecision(f,decision);updateTask(f,t=>mergeObservations(t,[{source:'liepin',resumeId:'synthetic',status:'partial',text:'新增证据'}],{roundId:'two',stage:'detail'}));assert.equal(sourcingProgress(readTask(f)).people[0].decisionStale,true);assert.equal(readTask(f).sourcing.decisions.length,1);updateTask(f,t=>{t.requirements.criteria[0].label='新标准';return t;});assert.equal(sourcingProgress(readTask(f)).contractStale,true);});
test('saved status alone is not target-group confirmation and unknown is preserved',t=>{const f=fixture(t);evaluate(f);recordSourcingDecision(f,decision);const op={operationId:'favorite-1',kind:'favorite',payload:{resumeId:'synthetic',group:'项目组'},status:'completed',evidence:{saved:true}};updateTask(f,t=>{t.operations=[op];return t;});assert.equal(sourcingProgress(readTask(f)).counts.favoriteConfirmed,0);updateTask(f,t=>{Object.assign(t.operations[0].evidence,{groupVerified:true,group:'项目组'});return t;});assert.equal(sourcingProgress(readTask(f)).counts.favoriteConfirmed,0);updateTask(f,t=>{t.operations[0].status='unknown';return t;});assert.equal(sourcingProgress(readTask(f)).people[0].favorite,'unknown');});

test('group membership requires a later exact selected-group readback with stable visible identity',t=>{
 const f=fixture(t);evaluate(f);recordSourcingDecision(f,decision);
 const write={operationId:'save',kind:'favorite',payload:{resumeId:'synthetic',group:'项目组'},status:'completed',evidence:{saved:true,groupVerified:true}};
 const read={operationId:'read',kind:'inspect',status:'completed',evidence:{verification:'favorites-list-readback',selectedGroup:'项目组',groupReadback:true,rows:[{resumeId:'synthetic',identityEvidence:'visible-detail-link'}]}};
 const check=(ops,n)=>{updateTask(f,t=>{t.operations=structuredClone(ops);return t;});assert.equal(sourcingProgress(readTask(f)).counts.favoriteConfirmed,n);};
 check([write,read],1);check([read,write],0);
 check([write,{...read,evidence:{...read.evidence,selectedGroup:'其他组'}}],0);
 check([write,{...read,evidence:{...read.evidence,rows:[{resumeId:'synthetic',identityEvidence:'conflicting-existing-id'}]}}],0);
 check([write,read,{operationId:'remove',kind:'unfavorite',payload:{resumeId:'synthetic'},status:'completed',evidence:{saved:false}}],0);
});
test('closure distinguishes partial and complete and expires when evidence changes',t=>{
 const f=fixture(t);evaluate(f);recordSourcingDecision(f,decision);
 const input={status:'complete',reviewer:'测试核对人',reason:'约定首页已处理',coverage:'合成首页一位',coverageConfirmed:true};
 assert.throws(()=>runLocalTask({file:f,mode:'sourcing-close',input}),/部分完成/);
 runLocalTask({file:f,mode:'sourcing-close',input:{...input,status:'partial'}});
 assert.equal(sourcingProgress(readTask(f)).closure.status,'partial');
 recordSourcingDecision(f,{...decision,decision:'not_pursued'});
 assert.equal(sourcingProgress(readTask(f)).closureStale,true);
 assert.throws(()=>runLocalTask({file:f,mode:'sourcing-close',input:{...input,coverageConfirmed:false}}),/部分完成/);
 runLocalTask({file:f,mode:'sourcing-close',input});assert.equal(sourcingProgress(readTask(f)).complete,true);
 updateTask(f,t=>{t.operations=[{status:'unknown'}];return t;});
 assert.equal(sourcingProgress(readTask(f)).complete,false);assert.equal(sourcingProgress(readTask(f)).closureStale,true);
});

test('directly identified list rows use canonical IDs for review and completion blockers',async t=>{
 const {detailTargets}=await import('../lib/detail-targets.js');const {recordListReview}=await import('../lib/sourcing-outcome.js');
 const f=fixture(t);updateTask(f,task=>{task.candidates[0].observations.push({stage:'list',roundId:'direct',hash:'direct-row',data:{summary:'合成列表',cardSelector:'.card',detailTarget:'.name'}});return task;});
 const [target]=detailTargets(readTask(f));assert.match(target.id,/^[a-f0-9]{64}$/);
 assert.ok(sourcingProgress(readTask(f)).blockers.includes('列表存在未复核或未补齐详情的条目'));
 recordListReview(f,{observationId:target.id,disposition:'reuse_detail',reason:'同一稳定身份已有可见详情，复用原文'});
 assert.equal(sourcingProgress(readTask(f)).blockers.includes('列表存在未复核或未补齐详情的条目'),false);
 assert.equal(readTask(f).sourcing.listReviews[0].hash,'direct-row');
});
