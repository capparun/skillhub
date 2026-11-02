import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveUpstream} from '../lib/upstream.mjs';
test('package-local upstream uses the current Node executable without relying on PATH',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-upstream-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'adapter-sdk'));fs.mkdirSync(path.join(root,'dist'));fs.writeFileSync(path.join(root,'dist/main.js'),'');
 const manifest={name:'opencli-mcp',version:'0.0.30',bin:{'opencli-mcp':'dist/main.js'}};fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(manifest));
 const resolve=()=>path.join(root,'adapter-sdk/index.js'),result=resolveUpstream(undefined,{resolve});
 assert.equal(result.command,process.execPath);assert.deepEqual(result.args,[path.join(root,'dist/main.js'),'stdio']);assert.equal(result.source,'package-local');
 manifest.version='0.0.31';fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(manifest));assert.throws(()=>resolveUpstream(undefined,{resolve}),/未启动/);
});
test('explicit overrides stay explicit and missing local install falls back visibly',()=>{
 assert.equal(resolveUpstream('/custom/command').source,'explicit');
 const result=resolveUpstream(undefined,{resolve:()=>{throw Object.assign(Error('missing'),{code:'MODULE_NOT_FOUND'});}});assert.equal(result.source,'PATH');
});
