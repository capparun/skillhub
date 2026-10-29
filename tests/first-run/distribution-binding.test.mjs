import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bindDistribution} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/distribution-binding.mjs';
test('direct internal entry rejects conflicting inherited launcher',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'binding-'));
 try{
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'linkedin-only-hunter-runtime'}));
 const entry=path.join(root,'opencli.mjs');fs.writeFileSync(entry,'');
 const source=path.join(root,'packages/workflow/src');fs.mkdirSync(source,{recursive:true});
 const env={};assert.equal(bindDistribution(source,env),true);assert.equal(env.HUNTER_OPENCLI_ENTRY,entry);
 assert.throws(()=>bindDistribution(source,{HUNTER_OPENCLI_ENTRY:'/other/main.js'}),{code:'runtime_entry_mismatch'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
