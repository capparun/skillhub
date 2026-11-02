import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {operation,createTask,saveSearchPage} from '../lib/workflow.mjs';
function task(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-mcp-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'task.json');createTask(file,{title:'合成验收'});return file;}
test('browser operation without bound scope never dispatches',async t=>{const f=task(t);await assert.rejects(operation(f,'one',{kind:'results',tab_id:'1',limit:3},()=>assert.fail('must not dispatch')),/共用站点/);});
test('unsupported operation kind never dispatches',async t=>{const f=task(t);await assert.rejects(operation(f,'one',{kind:'arbitrary'},()=>assert.fail()),/不支持/);});

test('engine list rows without source are saved with Liepin provenance',t=>{const f=task(t);const rows=saveSearchPage(f,{rows:[{name:'合成候选人',detailTarget:'.card-1'}]},'search-one');const saved=JSON.parse(fs.readFileSync(f));assert.equal(rows[0].source,'liepin');assert.equal(saved.unlinkedObservations.length,1);assert.equal(saved.unlinkedObservations[0].source,'liepin');assert.equal(saved.unlinkedObservations[0].identityStatus,'unresolved');});
