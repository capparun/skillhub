import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{parseCustomerArguments,installCustomer}from '../scripts/customer-install.mjs';import{buildPackage}from '../scripts/build-package.mjs';
test('website install arguments are recognized without accepting unknown or credential-bearing registry options',()=>{
 const args=parseCustomerArguments(['--product','liepin-search','--version','0.3.0-alpha.1','--server','https://example.com','--update-credential','test-secret','--npm-registry','https://registry.npmjs.org','--offline']);assert.equal(args['--offline'],true);
 for(const input of [['--unknown','x'],['--product'],['--product','other'],['--root','a','--root','b'],['--npm-registry','https://token@example.com']])assert.throws(()=>parseCustomerArguments(input));
});
test('customer install rejects wrong release or unowned state before dependency installation',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-customer-contract-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const candidate=buildPackage(path.join(temp,'package'),{delivery:'site-adapter'});let stages=0;const deps={packageDirectory:candidate.root,stage:()=>{stages++;}};
 await assert.rejects(installCustomer(['--version','9.9.9'],deps),/版本/);const root=path.join(temp,'occupied');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'unrelated.txt'),'keep');await assert.rejects(installCustomer(['--root',root,'--skills-dir',path.join(temp,'skills')],deps),/不是此安装器/);assert.equal(stages,0);assert.equal(fs.readFileSync(path.join(root,'unrelated.txt'),'utf8'),'keep');
});

test('ambiguous assistant directories stop before creating state or installing dependencies',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-assistant-selection-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const candidate=buildPackage(path.join(temp,'package'),{delivery:'site-adapter'}),root=path.join(temp,'state');let staged=false;
 await assert.rejects(installCustomer(['--root',root],{packageDirectory:candidate.root,resolveTargets:()=>({skillRoots:[path.join(temp,'claude'),path.join(temp,'workbuddy')],stateRoot:root}),stage:()=>{staged=true;}}),/多个助手目录/);
 assert.equal(staged,false);assert.equal(fs.existsSync(root),false);assert.equal(fs.existsSync(path.join(temp,'claude')),false);assert.equal(fs.existsSync(path.join(temp,'workbuddy')),false);
});
