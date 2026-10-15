import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validatePlan,initializeWorkflow,approveRound,runRound} from '../lib/workflow.js';
import {updateTask,readTask} from '../lib/task-store.js';
import {requirementBrief} from '../lib/requirements.js';
const plan={title:'嵌入式开发',sources:[{id:'jd',kind:'jd',text:'熟悉C语言，有嵌入式开发项目经验。Linux经验优先。'}],criteria:[{id:'c',label:'C语言',category:'skills',kind:'required',weight:1,evidence:[{sourceId:'jd',quote:'熟悉C语言'}]},{id:'linux',label:'Linux',category:'skills',kind:'bonus',weight:1,evidence:[{sourceId:'jd',quote:'Linux经验优先'}]}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'嵌入式开发',limit:1,pages:1},criterionIds:['c']}],openQuestions:['项目领域尚待确认']};
test('JD source quotes survive validation and appear in the requirement brief',()=>{
 const normalized=validatePlan(plan),brief=requirementBrief({requirements:normalized,rounds:normalized.rounds});
 assert.equal(brief.required.length,1);assert.equal(brief.bonus.length,1);
 assert.equal(brief.required[0].evidence[0].quote,'熟悉C语言');assert.equal(brief.openQuestions[0],'项目领域尚待确认');
 for(const change of [p=>p.criteria[0].evidence[0].quote='JD未写的资格',p=>p.criteria[0].evidence=[],p=>p.sources.push({...p.sources[0]}),p=>p.rounds[0].criterionIds=['missing']]) {
  const p=structuredClone(plan);change(p);assert.throws(()=>validatePlan(p));
 }
});
test('confirmed requirements changes stop before any browser execution',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-jd-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');
 initializeWorkflow(file,plan);approveRound(file,'trial',{confirmedAt:new Date().toISOString(),scope:'用户确认该方案'});
 assert.ok(readTask(file).rounds[0].requirementsFingerprint);
 updateTask(file,t=>{t.requirements.criteria[0].kind='bonus';return t;});
 await assert.rejects(runRound(file,'trial',async()=>assert.fail('must not execute')),/职位需求已变化/);
});
