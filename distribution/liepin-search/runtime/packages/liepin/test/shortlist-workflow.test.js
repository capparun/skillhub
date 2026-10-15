import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runTaskCommand} from '../task.js';

test('task command completes list review, selective detail review, final shortlist and all exports', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-shortlist-workflow-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'task.json');
  let sequence=0;
  function command(mode,input,extra={}) {
    const inputFile=path.join(dir,`${sequence++}.json`);
    fs.writeFileSync(inputFile,JSON.stringify(input));
    return runTaskCommand({mode,file,input:inputFile,...extra});
  }
  command('init',{title:'合成验收：嵌入式开发',criteria:[
    {id:'embedded',label:'嵌入式项目经验',category:'skills',kind:'required',weight:1},
  ],rounds:[{id:'trial',phase:'trial',filters:{keyword:'嵌入式',limit:2,pages:1}}]});
  command('import',[{resumeId:'synthetic-one',name:'合成候选人甲',city:'上海',summary:'参与嵌入式项目'}],{source:'liepin',roundId:'trial',stage:'list'});
  const show=()=>runTaskCommand({mode:'show',file});
  const list=show().candidates[0].observations[0];
  const evaluation={candidateKey:'liepin:synthetic-one',reviewer:'开发验收',reviewedAt:new Date().toISOString(),findings:[
    {criterionId:'embedded',status:'supported',reason:'列表说明相关项目',evidence:[{hash:list.hash,path:['summary'],quote:'参与嵌入式项目'}]},
  ]};
  command('evaluate',evaluation);
  const entry={candidateKey:evaluation.candidateKey,reason:'核实项目职责',evidenceGaps:['职责范围']};
  const decision={reviewer:'开发验收',reviewedAt:new Date().toISOString(),entries:[entry]};
  command('shortlist',{...decision,stage:'preliminary',deepReview:true,decisionReason:'合成流程验收'});
  command('import',[{resumeId:'synthetic-one',status:'partial',text:'负责合成嵌入式驱动项目',sections:[{heading:'项目经历',text:'负责合成嵌入式驱动项目'}]}],{source:'liepin',roundId:'detail-review',stage:'detail'});
  const detail=show().candidates[0].observations.at(-1);
  command('evaluate',{...evaluation,findings:[{criterionId:'embedded',status:'supported',reason:'详情补充驱动职责',evidence:[{hash:detail.hash,path:['text'],quote:'负责合成嵌入式驱动项目'}]}]});
  command('shortlist',{...decision,stage:'final',entries:[{...entry,changeReason:'详情证实驱动项目，仍需人工面试核验'}]});
  assert.equal(show().candidates[0].evaluations.length,2);
  assert.equal(show().shortlists[1].entries[0].initialEvaluation.findings[0].evidence[0].hash,list.hash);
  for(const format of ['html','markdown','csv','json']) {
    const output=path.join(dir,`report.${format}`);
    command('export',{format,output});
    const content=fs.readFileSync(output,'utf8');
    assert.ok(content.includes('合成候选人甲'));
    if(['html','markdown'].includes(format)) {
      assert.match(content,/最终短名单/);
      assert.match(content,/详情证实驱动项目/);
    }
    if(format==='json')assert.equal(JSON.parse(content).task.shortlists.length,2);
    if(format==='csv') {
      assert.match(content,/shortlistStage/);
      assert.match(content,/"final"/);
      assert.match(content,/详情证实驱动项目/);
    }
  }
  assert.equal(show().operations?.length ?? 0,0);
});
