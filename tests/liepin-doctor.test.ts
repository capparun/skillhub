import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('doctor reports EBUSY as unverified, never as missing or successful', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liepin-doctor-test-'));
  try {
    const preload = path.join(dir, 'preload.mjs');
    fs.writeFileSync(preload, `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
cp.spawnSync = () => ({status:null, stdout:'', stderr:'', error:Object.assign(new Error('spawn EBUSY'), {code:'EBUSY'})});
syncBuiltinESMExports();`);
    const skills = path.join(dir, 'skills');
    fs.mkdirSync(path.join(skills, 'hunter-liepin-search'), {recursive:true});
    const run = spawnSync(process.execPath, ['--import', preload, 'distribution/liepin-search/doctor.mjs', '--json', '--skills-dir', skills, '--state-dir', path.join(dir,'state')], {encoding:'utf8', env:{...process.env, OPENCLI_BIN:process.execPath}});
    const report = JSON.parse(run.stdout);
    assert.equal(run.status, 2);
    assert.equal(report.ok, false);
    assert.equal(report.status, 'unverified');
    const blocked = report.checks.filter((c: {status:string}) => c.status === 'unverified');
    assert.ok(blocked.length >= 2);
    assert.ok(blocked.every((c: {detail:string}) => c.detail.includes('EBUSY') && !c.detail.includes('未安装')));
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('doctor rejects a newer unreviewed OpenCLI even when its version command succeeds', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-doctor-version-'));
  try {
    for(const version of ['1.8.8','1.9.0']) {
      const preload=path.join(dir,`version-${version}.mjs`);
      fs.writeFileSync(preload,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.spawnSync=(_command,args)=>({status:0,stdout:args.includes('--version')?'${version}':'',stderr:''});syncBuiltinESMExports();`);
      const run=spawnSync(process.execPath,['--import',preload,'distribution/liepin-search/doctor.mjs','--json','--skills-dir',path.join(dir,'skills'),'--state-dir',path.join(dir,'state')],{encoding:'utf8',env:{...process.env,OPENCLI_BIN:process.execPath}});
      const report=JSON.parse(run.stdout),check=report.checks.find((c:{label:string})=>c.label.startsWith('OpenCLI '));
      assert.equal(check.ok,version==='1.8.8');assert.equal(check.detail,version);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
