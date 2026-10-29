import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
test('installed receipt binds entry and rejects environment overrides before execution',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'entry-test-'));
 try{
 const entry=path.join(dir,'product.mjs');fs.writeFileSync(entry,'');
 fs.copyFileSync(new URL('../../distribution/linkedin-only/skills/cskh-linkedin/scripts/opencli-runtime.mjs',import.meta.url),path.join(dir,'helper.mjs'));
 fs.writeFileSync(path.join(dir,'opencli-entry.json'),JSON.stringify({entry}));
 const {opencliInvocation}=await import(pathToFileURL(path.join(dir,'helper.mjs')));
 assert.deepEqual(opencliInvocation('',{}).prefix,[entry]);
 assert.deepEqual(opencliInvocation('',{HUNTER_OPENCLI_ENTRY:entry}).prefix,[entry]);
 for(const environment of [{HUNTER_OPENCLI_ENTRY:'/wrong/opencli.mjs'},{OPENCLI_BIN:'opencli'}])assert.throws(()=>opencliInvocation('',environment),{code:'runtime_entry_mismatch'});
 fs.unlinkSync(entry);
 assert.throws(()=>opencliInvocation('',{}),/安装指针无效/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
