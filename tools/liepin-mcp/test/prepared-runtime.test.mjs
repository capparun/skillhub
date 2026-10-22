import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildPackage} from '../scripts/build-package.mjs';
import {verifyPreparedRuntime} from '../scripts/verify-prepared-runtime.mjs';
test('prepared runtime verifier rejects changed files, missing entries and extra adapters',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-receipt-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const c=buildPackage(path.join(temp,'candidate'),{delivery:'site-adapter'}),manifest=JSON.parse(fs.readFileSync(path.join(c.root,'manifest.json')));
 const names=manifest.files.filter(f=>f.path.startsWith('tools/liepin-mcp/adapters/liepin/')).map(f=>path.basename(f.path));
 const files=['node_modules/opencli-mcp/dist/src/sites/executor.js','node_modules/opencli-mcp/dist/src/runtime/runtime.js','node_modules/opencli-mcp/dist/src/runtime/hunter-adapter-tabs.mjs','node_modules/opencli-mcp/dist/src/runtime/hunter-detail-reviews.mjs',...names.map(n=>'node_modules/opencli-mcp/adapters/liepin/'+n)].map(p=>{
  const file=path.join(c.root,p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');return {path:p,sha256:crypto.createHash('sha256').update('fixture').digest('hex')};
 });
 const receipt={sourceFingerprint:c.sourceFingerprint,status:'prepared-not-connected',files};
 const save=()=>fs.writeFileSync(path.join(c.root,'adapter-runtime-receipt.json'),JSON.stringify(receipt));save();
 assert.equal(verifyPreparedRuntime(c.root).browserVerified,false);
 const target=path.join(c.root,files[0].path);fs.writeFileSync(target,'changed');assert.throws(()=>verifyPreparedRuntime(c.root),/已变化/);fs.writeFileSync(target,'fixture');
 const removed=receipt.files.pop();save();assert.throws(()=>verifyPreparedRuntime(c.root),/缺少/);receipt.files.push(removed);save();
 fs.writeFileSync(path.join(c.root,'node_modules/opencli-mcp/adapters/liepin/extra.js'),'');assert.throws(()=>verifyPreparedRuntime(c.root),/额外/);
});
