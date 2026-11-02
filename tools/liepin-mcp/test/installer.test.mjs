import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildPackage} from '../scripts/build-package.mjs';
import {verifyPackage,stageInstall,selectVersion,npmCommand} from '../scripts/install-package.mjs';
function fixture(t){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-install-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));return {temp,candidate:buildPackage(path.join(temp,'candidate')),root:path.join(temp,'install')};}
test('installer checks the candidate manifest and rejects modified payload before installation',t=>{
 const {candidate,root}=fixture(t);assert.equal(verifyPackage(candidate.root,candidate.sourceFingerprint).manifest.files.length,candidate.files);
 fs.appendFileSync(path.join(candidate.root,'tools/liepin-mcp/server.mjs'),'\n// tamper');
 assert.throws(()=>stageInstall({source:candidate.root,root,expected:candidate.sourceFingerprint}),/校验失败/);assert.equal(fs.existsSync(root),false);
});
test('failed dependencies preserve current selection and cannot be selected as a rollback target',t=>{
 const {candidate,root}=fixture(t);fs.mkdirSync(root);const previous='{"fingerprint":"previous"}';fs.writeFileSync(path.join(root,'current.json'),previous);
 assert.throws(()=>stageInstall({source:candidate.root,root,expected:candidate.sourceFingerprint},{installDependencies:()=>{throw Error('synthetic network failure');}}),/synthetic/);
 assert.equal(fs.readFileSync(path.join(root,'current.json'),'utf8'),previous);
 assert.throws(()=>selectVersion({root,id:candidate.sourceFingerprint}),/已验证/);
});
test('installer rejects linked version roots before writing through them',t=>{
 const {candidate,root,temp}=fixture(t);fs.mkdirSync(root);const outside=path.join(temp,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,'versions'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>stageInstall({source:candidate.root,root,expected:candidate.sourceFingerprint}),/符号链接/);assert.deepEqual(fs.readdirSync(outside),[]);
});
test('concurrent installation lock is preserved and cannot be stolen',t=>{
 const {candidate,root}=fixture(t);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'install.lock'),'existing owner');
 assert.throws(()=>stageInstall({source:candidate.root,root,expected:candidate.sourceFingerprint}),/EEXIST/);
 assert.equal(fs.readFileSync(path.join(root,'install.lock'),'utf8'),'existing owner');assert.equal(fs.existsSync(path.join(root,'versions')),false);
});

test('Windows npm uses the companion JS entry without shell quoting or npm.cmd',()=>{
 const execPath=String.raw`C:\Program Files\节点工具\node.exe`;
 const cli=String.raw`C:\Program Files\节点工具\node_modules\npm\bin\npm-cli.js`;
 assert.deepEqual(npmCommand({execPath,platform:'win32',exists:file=>file===cli}),{command:execPath,prefix:[cli]});
 assert.throws(()=>npmCommand({execPath,platform:'win32',exists:()=>false}),/修复Node安装/);
});
test('macOS npm resolves a version-managed companion entry',()=>{
 const execPath='/Users/test/节点 工具/bin/node',cli='/Users/test/节点 工具/lib/node_modules/npm/bin/npm-cli.js';
 assert.deepEqual(npmCommand({execPath,platform:'darwin',exists:file=>file===cli}),{command:execPath,prefix:[cli]});
});
