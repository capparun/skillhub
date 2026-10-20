import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../local.mjs',import.meta.url));
const run=(cmd,args)=>spawnSync(process.execPath,[entry,cmd,'-'],{input:JSON.stringify(args),encoding:'utf8',env:{...process.env,HUNTER_MCP_COMMAND:'/nonexistent-browser'}});
test('local entry creates, reads and exports task under Unicode path without MCP',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'猎聘 本地-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'task.json'),output=path.join(root,'report.json');
 assert.equal(run('create',{file,title:'合成验收'}).status,0);
 const shown=run('task',{file,mode:'show'});assert.equal(shown.status,0);assert.equal(JSON.parse(shown.stdout).requirements.title,'合成验收');
 const report=run('report',{file,output,format:'json'});assert.equal(report.status,0,report.stderr);assert.ok(fs.existsSync(output));
});
test('local CLI rejects browser operations and reports snake_case filter names',()=>{
 assert.equal(run('search',{}).status,1);
 const conditions=run('conditions',{});assert.equal(conditions.status,0);
 const rows=JSON.parse(conditions.stdout);assert.equal(rows.length,30);assert.ok(rows.every(r=>/^[a-z][a-z0-9_]*$/.test(r.adapterKey)));
});
test('local import preserves channel identities, repeated snapshots and unidentified cards',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'猎聘 跨来源-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'task.json');
 const invoke=(cmd,args)=>{const result=run(cmd,args);assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
 invoke('create',{file,title:'跨来源合成对账'});
 for(const source of ['liepin','linkedin','maimai']){
  const args={file,mode:'import',source,roundId:'import-'+source,stage:'list',input:[{resumeId:'same-id',name:'同名示例'},{name:'同名示例'}]};
  invoke('task',args);invoke('task',args);
 }
 invoke('task',{file,mode:'import',source:'linkedin',roundId:'linkedin-detail',stage:'detail',input:[{resumeId:'same-id',name:'同名示例',status:'partial',text:'合成详情'}]});
 const task=invoke('task',{file,mode:'show'});
 assert.deepEqual(task.candidates.map(c=>c.key).sort(),['liepin:same-id','linkedin:same-id','maimai:same-id']);
 assert.equal(task.unlinkedObservations.length,3);
 assert.equal(task.candidates.find(c=>c.source==='linkedin').observations.length,2);
 const stats=invoke('task',{file,mode:'stats'});
 assert.equal(stats.candidates,3);assert.equal(stats.observations,4);assert.equal(stats.unresolvedIdentities,3);assert.equal(stats.readableDetails,1);
 assert.deepEqual(stats.sources,{liepin:1,linkedin:1,maimai:1});
 const before=fs.readFileSync(file,'utf8');
 const rejected=run('task',{file,mode:'import',source:'linkedin',roundId:'bad',stage:'list',input:[{source:'maimai',resumeId:'bad'}]});
 assert.equal(rejected.status,1);assert.equal(fs.readFileSync(file,'utf8'),before);
 const output=path.join(root,'report.json');invoke('report',{file,output,format:'json'});
 assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')).summary,stats);
});
