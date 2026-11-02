import test from 'node:test';import assert from 'node:assert/strict';import {reportOutcome} from '../lib/report-outcome.js';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
test('outcome report is absent for legacy tasks and escapes contract text',()=>{
 assert.equal(reportOutcome({},escape),'');
 const task={requirements:{criteria:[]},sourcing:{contracts:[{revision:1,stopCondition:'<script>stop</script>',groups:['组'],goal:'favorites',standardHash:'old'}],decisions:[]},candidates:[]};
 const html=reportOutcome(task,escape);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('标准已变化'));assert.ok(html.includes('不自动宣称寻访完成'));
});

test('recruiting brief shows follow-ups and bounded calibration cases, retaining all decisions in appendix',async()=>{
 const {createHash}=await import('node:crypto');const {evaluationFingerprint}=await import('../lib/evaluation.js');const {renderReport}=await import('../lib/report.js');
 const criteria=[],standardHash=createHash('sha256').update(JSON.stringify(criteria)).digest('hex');
 const task={requirements:{criteria,title:'合成渠道任务'},operations:[],rounds:[],events:[],sourcing:{contracts:[{revision:1,standardHash,stopCondition:'合成范围',groups:['组'],goal:'favorites'}],decisions:[]},candidates:[],unlinkedObservations:[]};
 for(let i=0;i<34;i++){
  const c={key:'liepin:id'+i,source:'liepin',identity:'id'+i,tags:[],observations:[{stage:'list',hash:'row-'+i,data:{name:'合成人选'+i,currentTitle:'工程师',currentCompany:'示例公司'}}],evaluations:[]};
  const fingerprint=evaluationFingerprint(task,c);c.evaluations.push({evidenceFingerprint:fingerprint,findings:[]});task.candidates.push(c);
  task.sourcing.decisions.push({candidateKey:c.key,decision:i<4?'follow_up':i<14?'clarify':'not_pursued',reason:'保存的职位相关理由'+i,gaps:['已保存的具体缺口'],group:'组',contractRevision:1,evidenceFingerprint:fingerprint});
 }
 const brief=reportOutcome(task,escape),full=reportOutcome(task,escape,{includeAll:true});assert.equal((brief.match(/data-outcome-row/g)||[]).length,7);assert.equal((full.match(/data-outcome-row/g)||[]).length,34);assert.ok(!brief.includes('保存的职位相关理由14'));assert.ok(full.includes('保存的职位相关理由33'));assert.match(brief,/本轮不跟进 20 位/);
 const rendered=renderReport(task,'html'),main=rendered.slice(0,rendered.indexOf('<details class="full-report-appendix">'));assert.equal((main.match(/data-outcome-row/g)||[]).length,7);assert.equal((main.match(/data-brief-row/g)||[]).length,0);assert.ok(rendered.includes('保存的职位相关理由33'));assert.equal((rendered.match(/<details/g)||[]).length,2);
});

test('research-only report does not present unrequested collection as an unfinished obligation',()=>{
 const task={requirements:{criteria:[]},sourcing:{contracts:[{revision:1,stopCondition:'只研究',groups:[],goal:'research',standardHash:'old'}],decisions:[]},candidates:[]};const html=reportOutcome(task,escape);assert.match(html,/本任务不执行收藏/);assert.ok(!html.includes('目标组收藏已确认'));assert.ok(!html.includes('<th>收藏结果</th>'));assert.match(html,/当前没有可展示的跟进或边界人选/);
});
test('follow-up table preserves search name after independent group membership read',async()=>{
 const {createHash}=await import('node:crypto'),{evaluationFingerprint}=await import('../lib/evaluation.js');
 const task={requirements:{criteria:[]},operations:[],sourcing:{contracts:[{revision:1,standardHash:createHash('sha256').update('[]').digest('hex'),stopCondition:'合成范围',groups:['合成组'],goal:'favorites'}],decisions:[]},candidates:[],unlinkedObservations:[]};
 const c={key:'liepin:synthetic',source:'liepin',identity:'synthetic',observations:[{stage:'list',hash:'search',data:{name:'合成乙**',currentTitle:'驱动工程师'}},{stage:'list',hash:'membership',data:{collection:'favorites',summary:'分组核验'}}],evaluations:[]};
 const fingerprint=evaluationFingerprint(task,c);c.evaluations.push({evidenceFingerprint:fingerprint,findings:[]});task.candidates.push(c);task.sourcing.decisions.push({candidateKey:c.key,decision:'follow_up',reason:'合成技术依据',gaps:[],group:'合成组',contractRevision:1,evidenceFingerprint:fingerprint});
 const html=reportOutcome(task,escape);assert.match(html,/合成乙\*\*/);assert.match(html,/驱动工程师/);assert.ok(!html.includes('姓名未记录'));
});
