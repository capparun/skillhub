import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runLocalTask} from '../lib/task-service.js';
import {readTask,updateTask} from '../lib/task-store.js';
import {currentEvaluation} from '../lib/evaluation.js';
import {renderReport,taskSummary} from '../lib/report.js';
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evaluation-fresh-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');
 const call=(mode,input,extra={})=>runLocalTask({file,mode,input,...extra});
 call('init',{title:'合成岗位',criteria:[{id:'skill',label:'技能',kind:'required',category:'skills',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成'}}]});
 call('import',[{resumeId:'one',summary:'具有驱动经验'}],{source:'liepin',stage:'list',roundId:'import'});
 const reviewer={reviewer:'测试',reviewedAt:new Date().toISOString()};
 const assess=()=>call('evaluate',{...reviewer,candidateKey:'liepin:one',findings:[{criterionId:'skill',status:'supported',reason:'合成依据',evidence:[{hash:readTask(file).candidates[0].observations[0].hash,path:['summary'],quote:'具有驱动经验'}]}]});
 assess();return {file,call,reviewer,assess};
}
test('new evidence invalidates assessment display and prevents reranking until reassessed',t=>{
 const {file,call,reviewer,assess}=setup(t);
 assert.equal(taskSummary(readTask(file)).evaluated,1);
 call('import',[{resumeId:'one',summary:'新增不同职责信息'}],{source:'liepin',stage:'list',roundId:'new'});
 let task=readTask(file);assert.equal(currentEvaluation(task,task.candidates[0]),null);assert.equal(taskSummary(task).evaluated,0);
 assert.match(renderReport(task,'html'),/历史评估已过期/);assert.match(renderReport(task,'markdown'),/历史评估已过期/);
 assert.doesNotMatch(renderReport(task,'html'),/合成依据/);
 const rank={...reviewer,entries:[{candidateKey:'liepin:one',reason:'人工核对',criterionIds:['skill']}]};
 assert.throws(()=>call('rank',rank),/复评/);
 assert.throws(()=>call('shortlist',{...reviewer,stage:'preliminary',deepReview:false,decisionReason:'列表复核',entries:[{candidateKey:'liepin:one',reason:'人工核对',evidenceGaps:[]}]}),/复评/);
 assess();call('rank',rank);task=readTask(file);assert.equal(task.candidates[0].evaluations.length,2);assert.equal(taskSummary(task).evaluated,1);
});
test('criteria changes and legacy assessments require explicit re-review; tags do not',t=>{
 const {file,call}=setup(t);call('tag',{candidateKey:'liepin:one',tags:['人工标记']});
 let task=readTask(file);assert.ok(currentEvaluation(task,task.candidates[0]));
 updateTask(file,task=>{task.requirements.criteria[0].label='新的岗位条件';return task;});
 task=readTask(file);assert.equal(currentEvaluation(task,task.candidates[0]),null);
 updateTask(file,task=>{delete task.candidates[0].evaluations[0].evidenceFingerprint;return task;});
 task=readTask(file);assert.equal(currentEvaluation(task,task.candidates[0]),null);assert.equal(task.candidates[0].evaluations.length,1);
});
