import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=new URL('../../distribution/linkedin-only/',import.meta.url);
test('doctor help exits before reading receipt, probing dependencies or browser',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doctor-help-'));
 try{
  for(const file of ['doctor.mjs','target-distribution.mjs','process-distribution.mjs'])await copyFile(new URL(file,source),join(dir,file));
  // No distribution.json or runtime exists: any diagnostic execution would fail.
  for(const args of [['--help'],['-h'],['--help','--linkedin-whoami','--linkedin-runtime']]){
   const r=spawnSync(process.execPath,[join(dir,'doctor.mjs'),...args],{encoding:'utf8',timeout:3000,env:{...process.env,PATH:dir}});
   assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Usage: node doctor.mjs/);assert.match(r.stdout,/不访问浏览器/);assert.equal(r.stderr,'');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
