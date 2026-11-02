import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {logger} from '../lib/workflow.mjs';
import {createTask,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
test('persistent action log retains scope, timestamp and dispatch versus return distinction',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-action-log-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);const log=logger(file,{operationId:'detail-1',tabId:'12'});
 log({phase:'dispatching',description:'点击经历展开按钮'});log({phase:'returned',description:'点击已返回，待回读'});
 const entries=readTask(file).events;assert.deepEqual(entries.map(e=>e.phase),['dispatching','returned']);
 assert.ok(entries.every(e=>e.operationId==='detail-1'&&e.tabId==='12'&&Number.isFinite(Date.parse(e.at))));
});
