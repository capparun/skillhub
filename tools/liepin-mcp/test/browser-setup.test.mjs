import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {planBrowserSetup,applyBrowserSetup,restoreBrowserSetup} from '../scripts/browser-setup.mjs';
const extensionId='abcdefghijklmnopabcdefghijklmnop',fingerprint='a'.repeat(64);
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'browser-setup-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const directory=path.join(root,'版本'),launcher=path.join(root,'启动器');fs.mkdirSync(directory);fs.writeFileSync(launcher,'synthetic launcher',{mode:0o700});fs.writeFileSync(path.join(root,'launcher-receipt.json'),JSON.stringify({directory,launcher,sourceFingerprint:fingerprint}));return {root,directory,launcher,manifest:path.join(root,'Chrome Native Hosts','com.opencli.mcp.json'),receipt:path.join(root,'backup.json'),verifyRuntime:dir=>{assert.equal(dir,directory);return {sourceFingerprint:fingerprint};}};}
test('first macOS registration previews without mutation, creates host and can remove only its own unchanged host',t=>{
 const f=fixture(t),deps={platform:'darwin',verifyRuntime:f.verifyRuntime};const plan=planBrowserSetup({...f,extensionId},deps);
 assert.equal(fs.existsSync(path.dirname(f.manifest)),false);assert.equal(plan.kind,'first-install');
 applyBrowserSetup({plan,receipt:f.receipt},deps);const actual=JSON.parse(fs.readFileSync(f.manifest));assert.equal(actual.path,f.launcher);assert.deepEqual(actual.allowed_origins,[`chrome-extension://${extensionId}/`]);
 assert.equal(restoreBrowserSetup(f.receipt,deps).restored,true);assert.equal(fs.existsSync(f.manifest),false);assert.equal(restoreBrowserSetup(f.receipt,deps).alreadyOriginal,true);
});
test('upgrade preserves official origins and extra settings and restores byte-exact baseline',t=>{
 const f=fixture(t),deps={platform:'darwin',verifyRuntime:f.verifyRuntime};fs.mkdirSync(path.dirname(f.manifest));const before=Buffer.from(JSON.stringify({name:'com.opencli.mcp',type:'stdio',path:'/original/launcher',allowed_origins:['chrome-extension://pppppppppppppppppppppppppppppppp/'],extra:'preserve'})+'\r\n');fs.writeFileSync(f.manifest,before);
 const plan=planBrowserSetup({...f,extensionId},deps);assert.equal(plan.kind,'upgrade');applyBrowserSetup({plan,receipt:f.receipt},deps);const actual=JSON.parse(fs.readFileSync(f.manifest));assert.equal(actual.extra,'preserve');assert.equal(actual.allowed_origins.length,2);
 restoreBrowserSetup(f.receipt,deps);assert.deepEqual(fs.readFileSync(f.manifest),before);
});
test('stale plans, changed runtime and reused backup paths stop before altering the host',t=>{
 const f=fixture(t),deps={platform:'darwin',verifyRuntime:f.verifyRuntime};const plan=planBrowserSetup({...f,extensionId},deps);
 fs.writeFileSync(f.receipt,'keep backup');assert.throws(()=>applyBrowserSetup({plan,receipt:f.receipt},deps),/EEXIST/);assert.equal(fs.existsSync(f.manifest),false);
 fs.unlinkSync(f.receipt);fs.writeFileSync(f.manifest,'later user data');assert.throws(()=>applyBrowserSetup({plan,receipt:f.receipt},deps),/已变化/);assert.equal(fs.readFileSync(f.manifest,'utf8'),'later user data');
 fs.unlinkSync(f.manifest);fs.appendFileSync(f.launcher,'changed');assert.throws(()=>applyBrowserSetup({plan,receipt:f.receipt},deps),/启动器已变化/);assert.equal(fs.existsSync(f.manifest),false);
});
test('rollback never overwrites a later edit or trusts modified backup bytes',t=>{
 const f=fixture(t),deps={platform:'darwin',verifyRuntime:f.verifyRuntime};const plan=planBrowserSetup({...f,extensionId},deps);applyBrowserSetup({plan,receipt:f.receipt},deps);fs.appendFileSync(f.manifest,' ');
 assert.throws(()=>restoreBrowserSetup(f.receipt,deps),/后续修改/);assert.ok(fs.readFileSync(f.manifest,'utf8').endsWith(' '));
 const receipt=JSON.parse(fs.readFileSync(f.receipt));receipt.plan.afterBase64=Buffer.from('tampered').toString('base64');fs.writeFileSync(f.receipt,JSON.stringify(receipt));assert.throws(()=>restoreBrowserSetup(f.receipt,deps),/校验失败/);
});
function memoryRegistry(){let state={exists:false,hasDefault:false,value:null,kind:null,otherValues:[],subKeys:[]};return {read:()=>structuredClone(state),set:value=>(state={exists:true,hasDefault:true,value,kind:'String',otherValues:[],subKeys:[]}),restore:before=>{state=structuredClone(before);return state;},external:value=>{state.value=value;}};}
test('Windows registration records and restores current-user manifest linkage along with the file',t=>{
 const f=fixture(t),registry=memoryRegistry(),deps={platform:'win32',verifyRuntime:f.verifyRuntime,registry};const before=registry.read();const plan=planBrowserSetup({...f,extensionId},deps);assert.deepEqual(registry.read(),before);applyBrowserSetup({plan,receipt:f.receipt},deps);assert.equal(registry.read().value,f.manifest);assert.equal(JSON.parse(fs.readFileSync(f.manifest)).path,f.launcher);
 restoreBrowserSetup(f.receipt,deps);assert.deepEqual(registry.read(),before);assert.equal(fs.existsSync(f.manifest),false);
});
test('Windows rollback refuses later registry edits and a failed registration retains a recoverable original backup',t=>{
 const f=fixture(t),registry=memoryRegistry(),deps={platform:'win32',verifyRuntime:f.verifyRuntime,registry};const plan=planBrowserSetup({...f,extensionId},deps);applyBrowserSetup({plan,receipt:f.receipt},deps);registry.external('later user path');assert.throws(()=>restoreBrowserSetup(f.receipt,deps),/注册表存在后续修改/);assert.equal(registry.read().value,'later user path');assert.equal(fs.existsSync(f.manifest),true);
 const g=fixture(t),failed=memoryRegistry(),failedDeps={platform:'win32',verifyRuntime:g.verifyRuntime,registry:{...failed,set:()=>{throw Error('access denied');}}};const p=planBrowserSetup({...g,extensionId},failedDeps);assert.throws(()=>applyBrowserSetup({plan:p,receipt:g.receipt},failedDeps),/原始配置已保存/);assert.equal(JSON.parse(fs.readFileSync(g.receipt)).phase,'failed');restoreBrowserSetup(g.receipt,failedDeps);assert.equal(fs.existsSync(g.manifest),false);
});
test('linked or broken-link manifest targets and linked directories are rejected',t=>{
 if(process.platform==='win32')return t.skip('Creating Windows links can require privileges');
 const f=fixture(t),deps={platform:'darwin',verifyRuntime:f.verifyRuntime};fs.mkdirSync(path.dirname(f.manifest));fs.symlinkSync(path.join(f.root,'missing'),f.manifest);
 assert.throws(()=>planBrowserSetup({...f,extensionId},deps),/普通文件/);fs.unlinkSync(f.manifest);fs.rmdirSync(path.dirname(f.manifest));const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.dirname(f.manifest));assert.throws(()=>planBrowserSetup({...f,extensionId},deps),/符号链接/);assert.deepEqual(fs.readdirSync(outside),[]);
});
test('macOS system temporary aliases resolve to the same host path without weakening custom-link rejection',t=>{
 if(process.platform!=='darwin')return t.skip('macOS system path alias only');
 const f=fixture(t),deps={platform:'darwin',verifyRuntime:f.verifyRuntime};const alias=f.manifest.replace(/^\/private\/var\//,'/var/');
 const plan=planBrowserSetup({...f,manifest:alias,extensionId},deps);assert.equal(plan.manifest,f.manifest);applyBrowserSetup({plan,receipt:f.receipt},deps);restoreBrowserSetup(f.receipt,deps);assert.equal(fs.existsSync(f.manifest),false);
});
