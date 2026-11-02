import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cleanupAdapterChildren} from '../lib/site-adapter-cleanup.mjs';
import {createTask,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
test('cleanup failure preserves durable evidence and still cleans other owned child',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-cleanup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'task.json');createTask(file);const calls=[],events=[];
 await assert.rejects(cleanupAdapterChildren({opened:()=>['2','3'],closeChild:async id=>{calls.push(id);if(id==='2')throw Error('close refused');}},{file,operationId:'detail-1',onAction:event=>events.push(event)}),/未完成/);
 assert.equal(events.filter(e=>e.phase==='returned').length,1);
 assert.equal(events.some(e=>e.phase==='verified'),false);
 assert.match(events.find(e=>e.phase==='returned').description,/未单独回读/);
 assert.deepEqual(calls,['2','3']);const saved=readTask(file).adapterCleanup;
 assert.equal(saved[0].status,'failed');assert.equal(saved[0].error,'close refused');assert.equal(saved[1].status,'closed');assert.equal(saved[0].authority,'current-call-only');
 await cleanupAdapterChildren({opened:()=>[],closeChild:()=>assert.fail('historical IDs are not authority')},{file,operationId:'detail-1'});
 assert.equal(readTask(file).adapterCleanup[0].status,'failed');
});
