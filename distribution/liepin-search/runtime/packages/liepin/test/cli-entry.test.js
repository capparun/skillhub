import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-cli-entry-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const script=path.join(dir,'cli.mjs');
  const cliUrl=new URL('./cli.js',import.meta.resolve('@jackwener/opencli/registry')).href;
  // Use upstream Commander/execution, isolating discovery from global plugins.
  fs.writeFileSync(script,`import ${JSON.stringify(new URL('../task.js',import.meta.url).href)};\nimport ${JSON.stringify(new URL('../detail.js',import.meta.url).href)};\nimport ${JSON.stringify(new URL('../search.js',import.meta.url).href)};\nimport {createProgram} from ${JSON.stringify(cliUrl)};\nawait createProgram(${JSON.stringify(dir)},${JSON.stringify(dir)}).parseAsync(process.argv);`);
  return {dir,run:(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000})};
}
test('real CLI argument parsing reaches offline task handler with the correct signature',t=>{
  const {dir,run}=fixture(t), file=path.join(dir,'task.json'), input=path.join(dir,'plan.json');
  fs.writeFileSync(input,JSON.stringify({title:'合成岗位',criteria:[{id:'skill',label:'项目经历',category:'experience',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成关键词',pages:1,limit:1}}]}));
  const initialized=run('liepin','task','init','--file',file,'--input',input,'-f','json');
  assert.equal(initialized.status,0,initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).data[0].status,'draft');
  const shown=run('liepin','task','show','--file',file,'-f','json');
  assert.equal(shown.status,0,shown.stderr);
  assert.equal(JSON.parse(shown.stdout).data[0].requirements.title,'合成岗位');
  const scope=path.join(dir,'scope.json');
  fs.writeFileSync(input,JSON.stringify({label:'合成账号',maxOperations:1,confirmedAt:new Date().toISOString()}));
  const created=run('liepin','task','scope-init','--file',scope,'--input',input,'-f','json');
  assert.equal(created.status,0,created.stderr);
  fs.writeFileSync(input,JSON.stringify({scopeFile:scope}));
  const bound=run('liepin','task','scope-bind','--file',file,'--input',input,'-f','json');
  assert.equal(bound.status,0,bound.stderr);
  assert.equal(JSON.parse(bound.stdout).data[0].siteScope.id,JSON.parse(created.stdout).data[0].id);
});
test('detail CLI rejects an invalid explicit page before runtime loading',t=>{
  const {dir,run}=fixture(t);
  const result=run('liepin','detail','synthetic','--page','unknown','--file',path.join(dir,'nonexistent.json'),'--operationId','op','-f','json');
  assert.notEqual(result.status,0);assert.match(result.stderr+result.stdout,/targetId/);
});
test('legacy search is rejected at the upstream argument boundary before browser execution',t=>{
  const {run}=fixture(t);
  const result=run('liepin','search','合成关键词','-f','json');
  assert.notEqual(result.status,0);
  assert.match(result.stdout+result.stderr,/required|必需|too many arguments/i);
  assert.doesNotMatch(result.stdout+result.stderr,/ECONNREFUSED|Connecting|bridge.*timeout/i);
});


test('actual CLI revise creates unapproved rounds without browser access',async t=>{
 const {dir,run}=fixture(t),file=path.join(dir,'task.json'),input=path.join(dir,'revision.json');
 const {initializeWorkflow,approveRound,runRound,reviewTrial}=await import('../lib/workflow.js');
 const {createSiteScope,bindSiteScope}=await import('../lib/site-scope.js');
 const scopeFile=path.join(dir,'scope.json'),now=new Date().toISOString();
 initializeWorkflow(file,{title:'合成岗位',criteria:[{id:'skill',label:'开发经历',category:'experience',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'开发',pages:1,limit:1}}]});
 createSiteScope(scopeFile,{label:'合成范围',maxOperations:2,confirmedAt:now});bindSiteScope(file,scopeFile);
 approveRound(file,'trial',{confirmedAt:now,scope:'合成搜索'});
 await runRound(file,'trial',async()=>({status:'completed',rows:[],evidence:{total:0}}));
 reviewTrial(file,{decision:'revise',notes:'修改关键词',reviewedAt:now});
 fs.writeFileSync(input,JSON.stringify({reason:'试搜空结果',proposedBy:'测试',proposedAt:now,rounds:[{id:'trial-2',phase:'trial',filters:{keyword:'嵌入式开发',pages:1,limit:1}}]}));
 const result=run('liepin','task','revise','--file',file,'--input',input,'-f','json');
 assert.equal(result.status,0,result.stderr);
 const task=JSON.parse(result.stdout).data[0];
 assert.equal(task.rounds.at(-1).status,'planned');assert.equal(task.operations.length,1);
 assert.equal(task.revisions.length,1);
});
