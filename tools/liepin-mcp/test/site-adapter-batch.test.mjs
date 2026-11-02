import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {adapterDetailBatch} from '../lib/site-adapter-detail-batch.mjs';
import {createTask,updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
test('completed adapter batch returns saved checkpoint without opening browser',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'task.json');createTask(file);updateTask(file,task=>({...task,detailBatches:[{id:'done',page:'1',status:'completed',items:[]}]}));
 const result=await adapterDetailBatch({args:{file,id:'done',tab_id:'1'},tab:{id:'1',act:()=>assert.fail('no action'),url:()=>assert.fail('no read')}});
 assert.equal(result.status,'completed');assert.equal(fs.existsSync(file+'.detail-batch.lock'),false);
});
