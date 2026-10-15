import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTask, readTask, saveObservations} from '../lib/task-store.js';
function fixture(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-task-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'task.json'); }
test('deduplicates stable IDs across rounds while retaining every source observation', t=>{
  const file=fixture(t);createTask(file,{title:'合成职位'});
  const row={source:'liepin',resumeId:'a',name:'测试'};
  saveObservations(file,[row,row],{stage:'list',roundId:'one'});
  saveObservations(file,[row],{stage:'list',roundId:'two'});
  const task=readTask(file);assert.equal(task.candidates.length,1);assert.equal(task.candidates[0].observations.length,2);
});
test('does not merge people by name or overwrite good detail with failed attempt', t=>{
  const file=fixture(t);createTask(file);
  saveObservations(file,[{source:'liepin',resumeId:'a',name:'测试'},{source:'linkedin',profileUrl:'https://www.linkedin.com/in/test',name:'测试'}],{stage:'list',roundId:'one'});
  saveObservations(file,[{source:'liepin',resumeId:'a',status:'readable',text:'完整可见文本'}],{stage:'detail',roundId:'one'});
  saveObservations(file,[{source:'liepin',resumeId:'a',status:'blocked'}],{stage:'detail',roundId:'two'});
  const task=readTask(file);assert.equal(task.candidates.length,2);assert.equal(task.candidates[0].observations[1].data.text,'完整可见文本');
});
test('invalid batch leaves prior task intact and clears its write lock',t=>{
  const file=fixture(t);createTask(file);const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>saveObservations(file,[{source:'liepin',resumeId:'a'},{source:'liepin',name:'no ID'}],{stage:'list',roundId:'one'}),/稳定标识/);
  assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(fs.existsSync(file+'.lock'),false);
});
test('does not overwrite existing tasks, steal locks or follow task symlinks',t=>{
  const file=fixture(t);createTask(file);
  assert.throws(()=>createTask(file),/已存在/);
  fs.writeFileSync(file+'.lock','busy');assert.throws(()=>saveObservations(file,[],{stage:'list',roundId:'one'}),/正在写入/);fs.unlinkSync(file+'.lock');
  const link=file+'.link';fs.symlinkSync(file,link);assert.throws(()=>readTask(link),/普通文件/);
});
