import test from 'node:test';
import assert from 'node:assert/strict';
import {platformRows,renderPlatformReport} from '../lib/platform-report.mjs';
test('platform view includes unlinked people without duplicating identity-linked cards',()=>{
 const observation={stage:'list',data:{name:'同名',summary:'<script>alert(1)</script>'}};
 const task={candidates:[{key:'a',observations:[observation,{stage:'detail',data:{status:'partial',text:'原文',sections:[{heading:'工作经历',text:'保存的经历'}],limitations:{attachmentRestricted:true}}}]}],unlinkedObservations:[{id:'linked',data:observation.data,link:{candidateKey:'a'}},{id:'unknown',data:{name:'同名'}}]};
 assert.equal(platformRows(task).length,2);
 const html=renderPlatformReport(task);assert.match(html,/2 条记录 · 1 份详情 · 1 份待读取/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/script-src 'sha256-/);
 assert.match(html,/仅列表，详情未读取/);assert.match(html,/未索要或解锁/);assert.match(html,/保存的经历/);
});
test('filter comparison distinguishes evidence from requested values',async()=>{
 const {platformFilters}=await import('../lib/platform-report.mjs');
 const rows=platformFilters({rounds:[{id:'r',operationId:'op',filters:{keyword:'请求',limit:3}}],operations:[{operationId:'op',evidence:{applied:[{field:'keyword',value:'实际'}]}}]});
 assert.equal(rows[0][2],'请求');assert.equal(rows[0][3],'实际');assert.equal(rows[1][3],'无逐项回读记录');
});
test('platform report retains explicit channel provenance for identified and unlinked imports',()=>{
 const task={candidates:[{key:'linkedin:id',source:'linkedin',observations:[{stage:'list',data:{name:'同名示例'}}]}],unlinkedObservations:[{id:'unknown',source:'maimai',data:{name:'同名示例'}}]};
 const rows=platformRows(task);assert.deepEqual(rows.map(r=>r.source),['linkedin','maimai']);
 const html=renderPlatformReport(task);assert.match(html,/<th>来源平台<\/th>/);assert.match(html,/<td>LinkedIn<\/td>/);assert.match(html,/<td>脉脉<\/td>/);
});
test('collapsed section limitations render useful labels rather than object coercion',()=>{
 const task={candidates:[{key:'synthetic',observations:[{stage:'detail',data:{status:'partial',text:'工作经历\n合成经历',sections:[],limitations:{collapsedSections:[{heading:'项目经历',remaining:3}]}}}]}],unlinkedObservations:[]};
 const html=renderPlatformReport(task);assert.match(html,/项目经历：3段未展开/);assert.doesNotMatch(html,/\[object Object\]/);
});
test('platform export cannot overwrite a task or follow a destination symlink',async t=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const {createTask}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');const {exportPlatformReport}=await import('../lib/platform-report.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'platform-output-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file);const before=fs.readFileSync(file,'utf8');assert.throws(()=>exportPlatformReport(file,file),/EEXIST/);assert.equal(fs.readFileSync(file,'utf8'),before);const link=path.join(dir,'linked.html');fs.symlinkSync(file,link);assert.throws(()=>exportPlatformReport(file,link),/EEXIST/);assert.equal(fs.readFileSync(file,'utf8'),before);
});
