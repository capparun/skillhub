import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../../distribution/linkedin-only/install.mjs',import.meta.url));
const manifest=JSON.parse(readFileSync(fileURLToPath(new URL('../../distribution/linkedin-only/distribution.json',import.meta.url)),'utf8'));
test('installer derives persistent identity from manifest without writing during preflight',()=>{
 const root=mkdtempSync(join(tmpdir(),'install-identity-'));
 try{
 const args=['--dry-run','--skills-dir',join(root,'skills'),'--state-dir',join(root,'state')];
 const r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);
 const p=JSON.parse(r.stdout);assert.equal(p.product,'soho-sourcing');assert.equal(p.version,manifest.version);assert.ok(p.actions.includes('write-installation-receipt'));assert.equal(p.runtimeTarget,join(root,'state/packages/soho-sourcing/runtime'));
 for(const override of [['--product','other'],['--version','9.0.0'],['--product','../escape']]){
 const x=spawnSync(process.execPath,[entry,...args,...override],{encoding:'utf8',timeout:5000});assert.equal(x.status,2);assert.match(x.stderr,/installation_identity_mismatch/);
 }
 assert.equal(existsSync(join(root,'skills')),false);assert.equal(existsSync(join(root,'state')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
