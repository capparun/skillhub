import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{execFileSync}from'node:child_process';
import{buildPackage}from'../scripts/build-package.mjs';import{buildDistributionArchive}from'../scripts/build-distribution-archive.mjs';
test('candidate website archive preserves identity and omits undeclared private files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-archive-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const candidate=buildPackage(path.join(root,'source'),{delivery:'site-adapter'});fs.writeFileSync(path.join(candidate.root,'private-receipt.json'),'secret');
 const output=path.join(root,'output'),args={source:candidate.root,expected:candidate.sourceFingerprint,output};
 const release=buildDistributionArchive(args);assert.equal(release.published,false);assert.equal(release.sourceFingerprint,candidate.sourceFingerprint);
 const names=execFileSync('tar',['-tzf',path.join(output,release.file)],{encoding:'utf8'});assert.ok(names.includes('/install.mjs'));assert.ok(names.includes('/doctor.mjs'));assert.ok(!names.includes('private-receipt'));assert.ok(!names.includes('node_modules'));
 assert.throws(()=>buildDistributionArchive(args),/已存在/);
 fs.appendFileSync(path.join(candidate.root,'install.mjs'),'changed');assert.throws(()=>buildDistributionArchive({...args,output:path.join(root,'tampered')}),/校验失败/);
});

test('formal version candidate aligns locked metadata and stays private and unapproved',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-formal-candidate-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const candidate=buildPackage(path.join(root,'source'),{delivery:'site-adapter',releaseVersion:'0.3.0'});
 const manifest=JSON.parse(fs.readFileSync(path.join(candidate.root,'manifest.json'))),pkg=JSON.parse(fs.readFileSync(path.join(candidate.root,'package.json'))),lock=JSON.parse(fs.readFileSync(path.join(candidate.root,'package-lock.json')));
 assert.equal(manifest.releaseStatus,'release-candidate-not-approved');assert.equal(pkg.version,'0.3.0');assert.equal(lock.packages[''].version,'0.3.0');assert.equal(lock.packages['node_modules/opencli-mcp'].version,'0.0.30');
 const release=buildDistributionArchive({source:candidate.root,expected:candidate.sourceFingerprint,output:path.join(root,'archive')});
 assert.equal(release.channel,'release-candidate');assert.equal(release.approved,false);assert.equal(release.published,false);assert.equal(release.version,'0.3.0');
 manifest.version='0.3.1';fs.writeFileSync(path.join(candidate.root,'manifest.json'),JSON.stringify(manifest));
 assert.throws(()=>buildDistributionArchive({source:candidate.root,expected:candidate.sourceFingerprint,output:path.join(root,'wrong-version')}),/版本不一致/);
 for(const [index,version] of ['0.3.01','0.3.0-beta','../0.3.0','1.0.0'].entries())assert.throws(()=>buildPackage(path.join(root,'rejected-'+index),{delivery:'site-adapter',releaseVersion:version}),/正式候选/);
});
