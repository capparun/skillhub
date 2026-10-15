import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

test('publication preflight checks explicit artifact without database or storage writes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-publication-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bytes=Buffer.from('synthetic publication artifact'),version='9.8.7',file=`liepin-search-v${version}.tar.gz`;
 const manifest={product:'liepin-search',version,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length};
 fs.writeFileSync(path.join(dir,file),bytes);fs.writeFileSync(path.join(dir,`liepin-search-v${version}.json`),JSON.stringify(manifest));
 const run=(args:string[])=>spawnSync(process.execPath,['scripts/publish-liepin-release.mjs',...args],{encoding:'utf8',env:{...process.env,DATABASE_URL:'',PACKAGE_STORAGE_DIR:''}});
 const args=['--version',version,'--artifact-dir',dir,'--check-only'];
 const checked=run(args);assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).published,false);
 assert.deepEqual(fs.readdirSync(dir).sort(),[file,`liepin-search-v${version}.json`].sort());
 fs.writeFileSync(path.join(dir,file),'tampered');assert.notEqual(run(args).status,0);
 assert.notEqual(run(['--version','0.2.0-preview','--check-only']).status,0);
 assert.notEqual(run([]).status,0);
});
