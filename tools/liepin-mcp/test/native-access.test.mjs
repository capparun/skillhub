import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {planAccess,applyAccess,restoreAccess} from '../scripts/native-access.mjs';
const official='lnaoghmfcdnbhgcihkakfobckmfhllkg',diagnostic='abcdefghijklmnopabcdefghijklmnop';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-access-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'通信 配置.json'),receipt=path.join(root,'backup.json');const bytes=Buffer.from(JSON.stringify({name:'com.opencli.mcp',type:'stdio',path:String.raw`C:\Program Files\工具\launcher.cmd`,allowed_origins:[`chrome-extension://${official}/`],extra:'preserve'})+'\r\n');fs.writeFileSync(file,bytes);return {file,receipt,bytes};}
test('allowlist adds one ID and restores original bytes including formatting',t=>{
 const {file,receipt,bytes}=fixture(t);const plan=planAccess(file,diagnostic);assert.equal(plan.changed,true);assert.deepEqual(fs.readFileSync(file),bytes);
 applyAccess({file,extensionId:diagnostic,receipt});const next=JSON.parse(fs.readFileSync(file));assert.equal(next.extra,'preserve');assert.equal(next.allowed_origins.length,2);assert.deepEqual(next.path,JSON.parse(bytes).path);
 assert.equal(restoreAccess(receipt).restored,true);assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(restoreAccess(receipt).alreadyOriginal,true);
});
test('subsequent configuration changes are never overwritten by restore',t=>{
 const {file,receipt}=fixture(t);applyAccess({file,extensionId:diagnostic,receipt});fs.appendFileSync(file,' ');
 assert.throws(()=>restoreAccess(receipt),/后续修改/);assert.ok(fs.readFileSync(file,'utf8').endsWith(' '));
});
test('existing backup prevents mutation and existing origin is not removed',t=>{
 const {file,receipt,bytes}=fixture(t);fs.writeFileSync(receipt,'existing');assert.throws(()=>applyAccess({file,extensionId:diagnostic,receipt}),/EEXIST/);assert.deepEqual(fs.readFileSync(file),bytes);
 const another=receipt+'.2';assert.equal(applyAccess({file,extensionId:official,receipt:another}).changed,false);assert.equal(restoreAccess(another).alreadyOriginal,true);
});
test('invalid IDs and unrelated native hosts are rejected before mutation',t=>{
 const {file}=fixture(t);assert.throws(()=>planAccess(file,'*'),/ID/);fs.writeFileSync(file,JSON.stringify({name:'other',allowed_origins:[]}));assert.throws(()=>planAccess(file,diagnostic),/官方/);
});
test('runtime switching preserves origins and restores exact original host path',t=>{
 const {file,receipt,bytes}=fixture(t),launcher=path.join(path.dirname(file),'隔离 启动器');
 fs.writeFileSync(launcher,'test-only launcher',{mode:0o700});
 const plan=planAccess(file,official,{launcher});assert.equal(plan.changed,true);assert.deepEqual(fs.readFileSync(file),bytes);
 applyAccess({file,extensionId:official,receipt,launcher});
 const actual=JSON.parse(fs.readFileSync(file));assert.equal(actual.path,launcher);assert.deepEqual(actual.allowed_origins,JSON.parse(bytes).allowed_origins);
 restoreAccess(receipt);assert.deepEqual(fs.readFileSync(file),bytes);
});
test('runtime plan rejects missing, relative and symbolic launcher targets',t=>{
 const {file,bytes}=fixture(t);
 assert.throws(()=>planAccess(file,official,{launcher:'relative'}),/绝对路径/);
 assert.throws(()=>planAccess(file,official,{launcher:path.join(path.dirname(file),'missing')}),/ENOENT/);
 if(process.platform!=='win32'){
  const link=path.join(path.dirname(file),'link');fs.symlinkSync(file,link);
  assert.throws(()=>planAccess(file,official,{launcher:link}),/普通文件/);
 }
 assert.deepEqual(fs.readFileSync(file),bytes);
});
