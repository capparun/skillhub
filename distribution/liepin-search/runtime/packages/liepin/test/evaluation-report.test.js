import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeWorkflow, importCandidates } from '../lib/workflow.js';
import { readTask, updateTask } from '../lib/task-store.js';
import { recordEvaluation, tagCandidate } from '../lib/evaluation.js';
import { renderReport, taskSummary, exportTask } from '../lib/report.js';
import { runTaskCommand } from '../task.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liepin-report-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const file = path.join(dir, 'task.json');
  initializeWorkflow(file, {title:'合成测试岗位', criteria:[
    {id:'js', label:'JavaScript 项目经验', category:'skills', kind:'required', weight:1},
    {id:'project', label:'交付经历', category:'experience', kind:'bonus', weight:1},
  ], rounds:[{id:'trial', phase:'trial', filters:{keyword:'开发', pages:1, limit:5}}]});
  importCandidates(file, [{resumeId:'synthetic', status:'readable', fullText:'合成样例：使用 JavaScript 完成项目。'}], {source:'liepin', roundId:'manual', stage:'detail'});
  const observation = readTask(file).candidates[0].observations[0];
  const input = {candidateKey:'liepin:synthetic', reviewer:'测试审阅者', reviewedAt:new Date().toISOString(), findings:[{criterionId:'js', status:'supported', reason:'有项目描述', evidence:[{hash:observation.hash, path:['fullText'], quote:'使用 JavaScript 完成项目'}]}]};
  return {file, dir, input};
}
test('evaluation quotes saved evidence and leaves unassessed criteria unknown', t => {
  const {file, input} = fixture(t);
  const result = recordEvaluation(file, input).candidates[0].evaluations[0];
  assert.equal(result.findings[0].status, 'supported');
  assert.equal(result.findings[1].status, 'unknown');
  assert.equal(result.requiresHumanReview, true);
  assert.equal(taskSummary(readTask(file)).evaluated, 1);
});
test('fabricated quotes, other snapshots, missing evidence and duplicate criteria do not save', t => {
  const {file, input} = fixture(t);
  const finding = input.findings[0];
  for (const findings of [
    [{...finding, evidence:[]}],
    [{...finding, evidence:[{...finding.evidence[0], quote:'十年经验'}]}],
    [{...finding, evidence:[{...finding.evidence[0], hash:'other'}]}],
    [{...finding, evidence:[{...finding.evidence[0], path:['__proto__']}]}],
    [finding, finding],
  ]) assert.throws(() => recordEvaluation(file, {...input, findings}));
  assert.equal(readTask(file).candidates[0].evaluations, undefined);
});
test('blocked detail observations cannot become evidence even if they contain matching text', t => {
  const {file, input} = fixture(t);
  importCandidates(file, [{resumeId:'synthetic', status:'blocked', fullText:'使用 JavaScript 完成项目'}], {source:'liepin', roundId:'failed', stage:'detail'});
  input.findings[0].evidence[0].hash = readTask(file).candidates[0].observations.at(-1).hash;
  assert.throws(() => recordEvaluation(file, input), /未确认读取/);
});
test('local tags preserve audit history; reports escape HTML, Markdown and spreadsheet formulas', t => {
  const {file, input} = fixture(t);
  input.findings[0].reason = '<img src=x onerror=alert(1)> [x](javascript:alert(1))';
  recordEvaluation(file, input);
  tagCandidate(file, {candidateKey:input.candidateKey, tags:[' =HYPERLINK("https://example.invalid")', '<script>alert(1)</script>']});
  const task = readTask(file);
  const html = renderReport(task, 'html');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html,/script-src 'sha256-/);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('default-src'));
  assert.ok(!renderReport(task, 'markdown').includes('[x](javascript:'));
  assert.ok(renderReport(task, 'csv').includes("\"'=HYPERLINK"));
  assert.deepEqual(JSON.parse(renderReport(task, 'json')).task, task);
  assert.equal(task.events.at(-1).type, 'tags_updated');
});
test('export refuses overwrites and symlinks; command drives offline review and export', t => {
  const {file, dir, input} = fixture(t);
  const action = path.join(dir, 'action.json');
  fs.writeFileSync(action, JSON.stringify(input));
  runTaskCommand({mode:'evaluate', file, input:action});
  assert.equal(runTaskCommand({mode:'stats', file}).evaluated, 1);
  const output = path.join(dir, 'report.html');
  fs.writeFileSync(action, JSON.stringify({format:'html', output}));
  runTaskCommand({mode:'export', file, input:action});
  assert.ok(fs.readFileSync(output, 'utf8').includes('JavaScript'));
  assert.throws(() => exportTask(file, {format:'json', output:file}), /EEXIST/);
  const link = path.join(dir, 'link.json'); fs.symlinkSync(file, link);
  assert.throws(() => exportTask(file, {format:'json', output:link}), /EEXIST/);
  assert.equal(readTask(file).candidates.length, 1);
});


test('exclusion evidence is flagged for human review; missing exclusion evidence stays unknown', t => {
 const {file,input}=fixture(t);
 updateTask(file,task=>{
  task.requirements.criteria.push({id:'conflict',label:'存在已确认的项目职责冲突',kind:'exclusion',category:'responsibilities',weight:1});
  task.requirements.criteria.push({id:'unverified',label:'其他待核实职责冲突',kind:'exclusion',category:'responsibilities',weight:1});
  return task;
 });
 importCandidates(file,[{resumeId:'synthetic',status:'readable',fullText:'合成案例：当前项目职责与目标岗位存在已确认的利益冲突。'}],{source:'liepin',roundId:'review',stage:'detail'});
 const observation=readTask(file).candidates[0].observations.at(-1);
 input.findings.push({criterionId:'conflict',status:'supported',reason:'合成案例明确说明职责冲突',evidence:[{hash:observation.hash,path:['fullText'],quote:'存在已确认的利益冲突'}]});
 const task=recordEvaluation(file,input),review=task.candidates[0].evaluations.at(-1);
 assert.match(review.findings.find(f=>f.criterionId==='conflict').reviewFlag,/排除项有证据/);
 assert.equal(review.findings.find(f=>f.criterionId==='unverified').status,'unknown');
 assert.equal(review.requiresHumanReview,true);assert.equal(task.candidates.length,1);
 for(const format of ['html','markdown'])assert.match(renderReport(task,format),/排除项有证据/);
});

test('human order is evidence bound and becomes stale after a new observation', async t=>{
 const {recordRanking,currentRanking}=await import('../lib/ranking.js');
 const {file,input}=fixture(t);
 const ranking={reviewer:'人工审阅者',reviewedAt:new Date().toISOString(),entries:[{candidateKey:input.candidateKey,criterionIds:['js'],reason:'先核对相关项目交付细节'}]};
 assert.throws(()=>recordRanking(file,ranking),/证据评估/);
 recordEvaluation(file,input);
 assert.throws(()=>recordRanking(file,{...ranking,entries:[{...ranking.entries[0],criterionIds:['project']}]}),/已核实/);
 assert.throws(()=>recordRanking(file,{...ranking,entries:[...ranking.entries,...ranking.entries]}),/重复/);
 recordRanking(file,ranking);
 const task=readTask(file);
 assert.equal(currentRanking(task).entries[0].candidateKey,input.candidateKey);
 for(const format of ['html','markdown','csv'])assert.ok(renderReport(task,format).includes(ranking.entries[0].reason));
 importCandidates(file,[{resumeId:'synthetic',status:'partial',fullText:'新的职位相关经历'}],{source:'liepin',roundId:'later',stage:'detail'});
 assert.equal(currentRanking(readTask(file)),null);
 assert.ok(renderReport(readTask(file),'html').includes('排序已过期'));
 assert.equal(readTask(file).rankings.length,1);
});

 test('all export formats retain saved detail text before evaluation', t=>{
  const {file}=fixture(t),task=readTask(file);
  for(const format of ['json','csv','markdown','html']){
   const report=renderReport(task,format);
   assert.ok(report.includes('使用 JavaScript 完成项目'),`${format} lost the saved detail`);
  }
  assert.match(renderReport(task,'markdown'),/尚未评估/);
 });
test('human-readable reports preserve requirement provenance, open questions and escape source content',t=>{
 const {file}=fixture(t),task=readTask(file);
 task.requirements.sources=[{id:'jd',kind:'jd',title:'测试JD<script>',text:'需要JavaScript项目经验'}];
 task.requirements.criteria[0].evidence=[{sourceId:'jd',quote:'需要JavaScript项目经验'}];
 task.requirements.openQuestions=['项目领域尚未确认<img>'];
 for(const format of ['html','markdown']){
 const content=renderReport(task,format);assert.ok(content.includes('需求与依据'));assert.ok(content.includes('需要JavaScript项目经验'));assert.ok(content.includes('项目领域尚未确认'));assert.equal((content.match(/<script>/g)??[]).length,format==='html'?1:0);assert.ok(content.includes('测试JD&lt;script&gt;'));assert.ok(!content.includes('<img>'));
 }
 task.requirements={title:'无需求的采集记录'};
 for(const format of ['html','markdown'])assert.ok(renderReport(task,format).includes('尚未记录岗位条件'));
});
test('CSV keeps task purpose and criteria provenance alongside evidence rows',t=>{
 const {file}=fixture(t),task=readTask(file);task.requirements.title='开发验收样例，非招聘结论';task.requirements.openQuestions=['正式JD尚待确认'];
 const csv=renderReport(task,'csv');assert.ok(csv.includes('"taskTitle","requirements"'));assert.ok(csv.includes('开发验收样例，非招聘结论'));assert.ok(csv.includes('正式JD尚待确认'));
});
