import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkReadRuntime} from '../lib/current-detail.js';

test('reviewed OpenCLI 2.0 files pass; old versions and modified transport are rejected',t=>{
 assert.equal(checkReadRuntime().version,'2.0.0');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-runtime-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const browser=path.join(root,'dist/src/browser');fs.mkdirSync(browser,{recursive:true});
 const source=import.meta.resolve('@jackwener/opencli/browser/page');
 for(const file of ['page.js','daemon-client.js'])fs.copyFileSync(new URL(file,source),path.join(browser,file));
 const entry=pathToFileURL(path.join(browser,'page.js')).href;
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.8.8'}));
 assert.throws(()=>checkReadRuntime(entry),/尚未审查/);
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'2.0.0'}));
 assert.equal(checkReadRuntime(entry).version,'2.0.0');
 fs.appendFileSync(path.join(browser,'daemon-client.js'),'\n// changed');
 assert.throws(()=>checkReadRuntime(entry),/不一致/);
});
