import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const serverEntry=fileURLToPath(new URL('../server.mjs',import.meta.url));
test('stdio lists tools and creates/exports task without browser dependency',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-server-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json'),output=path.join(dir,'report.html');
 const messages=[{id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'liepin_task_init',arguments:{file,title:'合成验收'}}},{id:4,method:'tools/call',params:{name:'liepin_report',arguments:{file,output,format:'html'}}}];
 const result=spawnSync(process.execPath,[serverEntry],{input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr);const responses=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(responses.length,4);assert.equal(responses[1].result.tools.length,19);assert.ok(!responses[3].result.isError,JSON.stringify(responses[3]));assert.match(fs.readFileSync(output,'utf8'),/合成验收/);
});
test('unscoped result request fails before starting a browser child',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-preflight-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');
 const messages=[{id:1,method:'tools/call',params:{name:'liepin_task_init',arguments:{file,title:'合成'}}},{id:2,method:'tools/call',params:{name:'liepin_results',arguments:{file,operation_id:'read',tab_id:'1'}}}];
 const result=spawnSync(process.execPath,[serverEntry],{input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr);const responses=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(responses[1].result.isError,true);assert.match(responses[1].result.content[0].text,/共用站点/);assert.doesNotMatch(result.stderr,/ENOENT/);
});
test('queued MCP cancellation stops local tool side effects',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-cancel-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');
 const messages=[{id:1,method:'tools/call',params:{name:'liepin_task_init',arguments:{file,title:'应取消'}}},{method:'notifications/cancelled',params:{requestId:1}}];
 const result=spawnSync(process.execPath,[serverEntry],{input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/取消/);assert.equal(fs.existsSync(file),false);
});
test('MCP initializes requirements, scope and approval without a browser dependency',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-local-task-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),scope=path.join(dir,'scope.json'),confirmedAt=new Date().toISOString();
 const call=(id,mode,input,fileArg=file)=>({id,method:'tools/call',params:{name:'liepin_task',arguments:{file:fileArg,mode,...(input?{input}:{})}}});
 const plan={title:'合成研发需求',criteria:[{id:'skill',label:'嵌入式经验',category:'skills',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成测试',limit:3}}]};
 const messages=[call(1,'init',plan),call(2,'scope-init',{label:'合成账号',maxOperations:5,confirmedAt},scope),call(3,'scope-bind',{scopeFile:scope}),call(4,'approve',{roundId:'trial',confirmedAt,scope:'合成试搜'}),call(5,'brief'),{id:6,method:'tools/call',params:{name:'liepin_conditions',arguments:{}}}];
 const result=spawnSync(process.execPath,[serverEntry],{input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr);const responses=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(responses.length,6);for(const r of responses)assert.ok(!r.result.isError,JSON.stringify(r));
 const task=JSON.parse(fs.readFileSync(file));assert.equal(task.rounds[0].status,'approved');assert.equal(task.siteScope.file,fs.realpathSync(scope));assert.equal(task.operations.length,0);assert.equal(JSON.parse(responses[5].result.content[0].text).length,30);
});
test('malformed JSON-RPC and tool arguments return errors without crashing or connecting',()=>{
 const messages=['null',JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liepin_close',arguments:{tab_id:42}}}),JSON.stringify({jsonrpc:'2.0',id:2,method:'ping'})];
 const result=spawnSync(process.execPath,[serverEntry],{input:messages.join('\n')+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr);const responses=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(responses[0].error.code,-32600);assert.equal(responses.find(r=>r.id===1).result.isError,true);assert.deepEqual(responses.find(r=>r.id===2).result,{});
});
test('closing a tab before connecting never starts a browser process',()=>{
 const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liepin_close',arguments:{tab_id:'123'}}};
 const result=spawnSync(process.execPath,[serverEntry],{input:JSON.stringify(request)+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr);
 const response=JSON.parse(result.stdout);assert.equal(response.result.isError,true);
 assert.match(response.result.content[0].text,/尚未创建标签/);assert.doesNotMatch(result.stderr,/ENOENT/);
});
test('MCP local evidence workflow reaches final shortlist and four report formats without browser',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-delivery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json'),reviewedAt=new Date().toISOString();
 const task=(mode,input,extra={})=>({method:'tools/call',params:{name:'liepin_task',arguments:{file,mode,input,...extra}}});
 const send=messages=>{
  const result=spawnSync(process.execPath,[serverEntry],{input:messages.map((m,i)=>JSON.stringify({jsonrpc:'2.0',id:i+1,...m})).join('\n')+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'},maxBuffer:5*1024*1024});
  assert.equal(result.status,0,result.stderr);const responses=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(responses.length,messages.length);for(const r of responses)assert.ok(!r.error&&!r.result.isError,JSON.stringify(r));
 };
 send([task('init',{title:'合成闭环需求',criteria:[{id:'skill',label:'嵌入式经验',category:'skills',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成'}}]}),task('import',[{resumeId:'synthetic',summary:'具有嵌入式项目经验'}],{source:'liepin',stage:'list',roundId:'local-import'})]);
 const hash=JSON.parse(fs.readFileSync(file)).candidates[0].observations[0].hash;
 const reviewer={reviewer:'合成测试审阅者',reviewedAt},entry={candidateKey:'liepin:synthetic',reason:'依据保存的项目描述列入人工复核',evidenceGaps:['职责范围待核实']};
 send([
  task('evaluate',{...reviewer,candidateKey:entry.candidateKey,findings:[{criterionId:'skill',status:'supported',reason:'原文明确描述项目经验',evidence:[{hash,path:['summary'],quote:'嵌入式项目经验'}]}]}),
  task('rank',{...reviewer,entries:[{...entry,criterionIds:['skill']}]}),
  task('shortlist',{...reviewer,stage:'preliminary',deepReview:false,decisionReason:'合成测试仅验证列表证据流程',entries:[entry]}),
  task('shortlist',{...reviewer,stage:'final',entries:[{...entry,changeReason:'保留待核实项，不作录用结论'}]}),
  ...['html','json','csv','markdown'].map(format=>task('export',{format,output:path.join(dir,'report.'+format)})),
 ]);
 const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.shortlists.length,2);assert.equal(saved.rankings.length,1);assert.equal(saved.candidates[0].evaluations.length,1);
 for(const format of ['html','json','csv','markdown'])assert.ok(fs.statSync(path.join(dir,'report.'+format)).size>0);
 assert.match(fs.readFileSync(path.join(dir,'report.html'),'utf8'),/最终短名单/);assert.equal(saved.operations?.length??0,0);
});

test('MCP deep-review requires new detail assessment and invalidates final report after new evidence',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-deep-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json'),output=path.join(dir,'report.html');
 const invoke=(mode,input,extra={},expectError=false)=>{
  const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liepin_task',arguments:{file,mode,...(input?{input}:{}),...extra}}};
  const run=spawnSync(process.execPath,[serverEntry],{input:JSON.stringify(request)+'\n',encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent'},maxBuffer:5*1024*1024});
  assert.equal(run.status,0,run.stderr);const response=JSON.parse(run.stdout).result;
  assert.equal(Boolean(response.isError),expectError,response.content[0].text);return JSON.parse(response.content[0].text);
 };
 const reviewer={reviewer:'合成验收',reviewedAt:new Date().toISOString()},key='liepin:deep';
 const entry={candidateKey:key,reason:'核对项目职责',evidenceGaps:['实际职责待复核']};
 const findings=(hash,quote)=>[{criterionId:'skill',status:'supported',reason:'仅依据合成原文',evidence:[{hash,path:['summary'],quote}]}];
 invoke('init',{title:'合成深读验收',criteria:[{id:'skill',label:'嵌入式经验',category:'skills',kind:'required',weight:1}],rounds:[{id:'trial',phase:'trial',filters:{keyword:'合成'}}]});
 invoke('import',[{resumeId:'deep',summary:'嵌入式项目经验'}],{source:'liepin',stage:'list',roundId:'import-list'});
 let saved=JSON.parse(fs.readFileSync(file));const listHash=saved.candidates[0].observations[0].hash;
 invoke('evaluate',{...reviewer,candidateKey:key,findings:findings(listHash,'嵌入式项目经验')});
 invoke('shortlist',{...reviewer,stage:'preliminary',deepReview:true,decisionReason:'需要详情职责证据',entries:[entry]});
 const final={...reviewer,stage:'final',entries:[{...entry,changeReason:'详情补充后保留待核实项'}]};
 assert.match(invoke('shortlist',final,{},true).message,/单独保存复评/);
 invoke('import',[{resumeId:'deep',status:'partial',summary:'负责嵌入式驱动开发'}],{source:'liepin',stage:'detail',roundId:'import-detail'});
 saved=JSON.parse(fs.readFileSync(file));const detailHash=saved.candidates[0].observations.find(o=>o.stage==='detail').hash;
 invoke('evaluate',{...reviewer,candidateKey:key,findings:findings(detailHash,'负责嵌入式驱动开发')});
 invoke('shortlist',final);invoke('export',{format:'html',output});
 assert.match(fs.readFileSync(output,'utf8'),/最终短名单/);
 saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.shortlists.at(-1).entries[0].evidenceLevel,'visible_detail');
 assert.equal(saved.shortlists.at(-1).entries[0].initialEvaluation.findings[0].evidence[0].hash,listHash);
 assert.equal(saved.shortlists.at(-1).entries[0].finalEvaluation.findings[0].evidence[0].hash,detailHash);
 invoke('import',[{resumeId:'deep',status:'partial',summary:'新增职责信息待复评'}],{source:'liepin',stage:'detail',roundId:'new-detail'});
 invoke('export',{format:'html',output:path.join(dir,'updated.html')});
 assert.match(fs.readFileSync(path.join(dir,'updated.html'),'utf8'),/短名单已过期/);
 assert.equal(JSON.parse(fs.readFileSync(file)).operations?.length??0,0);
});
