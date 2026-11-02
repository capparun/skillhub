import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {createTask,readTask,updateTask} from '../lib/task-store.js';import {evaluationFingerprint} from '../lib/evaluation.js';import {exportTask} from '../lib/report.js';import {observedResumeUrl} from '../lib/report-links.js';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'报告 bundle '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file,{title:'合成岗位'});
 updateTask(file,task=>{task.requirements.criteria=[];const c={key:'liepin:sample',source:'liepin',identity:'sample',tags:[],observations:[{stage:'list',hash:'list',data:{name:'示例人选',currentCompany:'示例公司',currentTitle:'伺服工程师'}},{stage:'detail',hash:'detail',data:{status:'partial',url:'https://h.liepin.com/resume/showresumedetail/?res_id_encode=sample',text:'SAVED_DETAIL_SENTINEL',sections:[{heading:'工作经历',text:'SAVED_DETAIL_SENTINEL'}]}}],evaluations:[]};const fingerprint=evaluationFingerprint(task,c);c.evaluations.push({findings:[],evidenceFingerprint:fingerprint});task.candidates=[c];task.unlinkedObservations=[{id:'unlinked',identityStatus:'unresolved',source:'liepin',data:{summary:'RAW_ONLY_SENTINEL'}}];task.sourcing={contracts:[{revision:1,goal:'favorites',groups:['示例组'],standardHash:createHash('sha256').update('[]').digest('hex'),stopCondition:'合成范围'}],decisions:[{candidateKey:c.key,decision:'follow_up',reason:'相关工程证据',gaps:['需补核量产'],group:'示例组',contractRevision:1,evidenceFingerprint:fingerprint}]};return task;});return {dir,file,output:path.join(dir,'重点 摘要.html')};
}
test('HTML export puts metrics first and creates linked details and separate lossless records',t=>{
 const {file,output}=fixture(t),before=JSON.stringify(readTask(file)),result=exportTask(file,{output,format:'html'}),html=fs.readFileSync(output,'utf8'),details=fs.readFileSync(result.files.details,'utf8'),raw=JSON.parse(fs.readFileSync(result.files.records));
 assert.ok(html.indexOf('class="report-snapshot"')<html.indexOf('<header>'));assert.match(html,/值得跟进/);assert.match(html,/\.details\.html#candidate-0/);assert.match(html,/res_id_encode=sample/);assert.match(html,/rel="noopener noreferrer"/);assert.ok(!html.includes('RAW_ONLY_SENTINEL'));assert.ok(!html.includes('SAVED_DETAIL_SENTINEL'));assert.ok(!html.includes('<details'));assert.match(details,/id="candidate-0"/);assert.match(details,/SAVED_DETAIL_SENTINEL/);assert.ok(!details.includes('RAW_ONLY_SENTINEL'));assert.equal(raw.task.unlinkedObservations[0].data.summary,'RAW_ONLY_SENTINEL');assert.equal(JSON.stringify(readTask(file)),before);
 assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(html,/\.summary-view \.outcome-table tr\{display:grid/);assert.ok(html.includes(encodeURIComponent(path.basename(result.files.records))));
 if(process.platform!=='win32')for(const f of Object.values(result.files))assert.equal(fs.statSync(f).mode&0o777,0o600);
});
test('sidecar collisions preserve existing files and do not publish a partial entry page',t=>{
 const {file,output,dir}=fixture(t),details=path.join(dir,'重点 摘要.details.html');fs.writeFileSync(details,'keep');assert.throws(()=>exportTask(file,{output,format:'html'}),/EEXIST/);assert.equal(fs.readFileSync(details,'utf8'),'keep');assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(path.join(dir,'重点 摘要.records.json')),false);
});
test('a failed entry write removes only files created by this bundle',t=>{
 const {file,output,dir}=fixture(t),original=fs.writeFileSync;let writes=0;fs.writeFileSync=(...args)=>{if(++writes===3)throw Error('synthetic disk failure');return original(...args);};try{assert.throws(()=>exportTask(file,{output,format:'html'}),/synthetic disk failure/);}finally{fs.writeFileSync=original;}
 for(const name of ['重点 摘要.html','重点 摘要.details.html','重点 摘要.records.json'])assert.equal(fs.existsSync(path.join(dir,name)),false);
});
test('platform link must be observed, HTTPS, same platform and match the saved stable identity',()=>{
 const candidate=url=>({source:'liepin',identity:'sample',observations:[{stage:'detail',data:{url}}]});
 for(const url of ['javascript:alert(1)','https://example.test/?res_id_encode=sample','https://h.liepin.com/resume/showresumedetail/?res_id_encode=other','https://h.liepin.com/resume/showresumedetail/?res_id_encode=sample&res_id_encode=sample','https://user:password@h.liepin.com/resume/showresumedetail/?res_id_encode=sample'])assert.equal(observedResumeUrl(candidate(url)),null);
 const url='https://h.liepin.com/resume/showresumedetail/?res_id_encode=sample';assert.equal(observedResumeUrl(candidate(url)),url);
});
