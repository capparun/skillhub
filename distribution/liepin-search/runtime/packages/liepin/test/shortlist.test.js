import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask,updateTask,readTask} from '../lib/task-store.js';
import {recordShortlist,currentShortlist} from '../lib/shortlist.js';
import {renderShortlist} from '../lib/report-shortlist.js';

function setup(t,deepReview) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-shortlist-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'task.json');
  createTask(file,{criteria:[{id:'skill'}]});
  updateTask(file,task=>{
    task.candidates=[{key:'liepin:synthetic',observations:[],evaluations:[{findings:[]}]}];
    return task;
  });
  const entry={candidateKey:'liepin:synthetic',reason:'人工选择补充核实',evidenceGaps:['项目职责']};
  const base={reviewer:'测试审阅者',reviewedAt:new Date().toISOString(),entries:[entry]};
  recordShortlist(file,{...base,stage:'preliminary',deepReview,decisionReason:'本轮已确认范围'});
  return {file,base,entry};
}

test('list-only final preserves initial snapshot, permits an empty final and becomes stale on evidence changes',t=>{
  const {file,base,entry}=setup(t,false);
  recordShortlist(file,{...base,stage:'final',entries:[{...entry,changeReason:'未进行详情深读，保留列表依据'}]});
  const final=currentShortlist(readTask(file));
  assert.equal(final.entries[0].evidenceLevel,'list_only');
  assert.match(renderShortlist(readTask(file),'html',String),/最终短名单/);
  assert.match(renderShortlist(readTask(file),'markdown',String),/仅依据列表证据/);
  assert.deepEqual(final.entries[0].initialEvaluation,{findings:[]});
  updateTask(file,task=>{task.candidates[0].observations.push({hash:'new'});return task;});
  assert.equal(currentShortlist(readTask(file)),null);
  assert.match(renderShortlist(readTask(file),'html',String),/短名单已过期/);
  assert.ok(!renderShortlist(readTask(file),'html',String).includes('入选理由'));
  recordShortlist(file,{...base,stage:'final',entries:[]});
  assert.equal(currentShortlist(readTask(file)).entries.length,0);
});

test('deep-review final requires a separate evaluation citing successful detail evidence',t=>{
  const {file,base,entry}=setup(t,true);
  const input={...base,stage:'final',entries:[{...entry,changeReason:'详情补充职责证据'}]};
  assert.throws(()=>recordShortlist(file,input),/单独保存复评/);
  updateTask(file,task=>{task.candidates[0].evaluations.push({findings:[]});return task;});
  assert.throws(()=>recordShortlist(file,input),/详情证据/);
  updateTask(file,task=>{
    const candidate=task.candidates[0];
    candidate.observations.push({hash:'detail',stage:'detail',data:{status:'partial'}});
    candidate.evaluations.push({findings:[{evidence:[{hash:'detail'}]}]});return task;
  });
  recordShortlist(file,input);
  assert.deepEqual(currentShortlist(readTask(file)).entries[0].initialEvaluation,{findings:[]});
  assert.equal(currentShortlist(readTask(file)).entries[0].evidenceLevel,'visible_detail');
  assert.equal(readTask(file).shortlists.length,2);
});

test('changed requirements and duplicate candidates cannot silently produce a final list',t=>{
  const {file,base,entry}=setup(t,false);
  assert.throws(()=>recordShortlist(file,{...base,stage:'final',entries:[{...entry,changeReason:'保持'},{...entry,changeReason:'保持'}]}),/重复/);
  updateTask(file,task=>{task.requirements.criteria.push({id:'new'});return task;});
  assert.throws(()=>recordShortlist(file,{...base,stage:'final',entries:[]}),/当前岗位条件/);
});
