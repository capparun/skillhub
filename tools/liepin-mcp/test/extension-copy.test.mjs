import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {copyExtensionTree} from '../build-extension.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'extension-copy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const source=path.join(root,'官方 扩展');fs.mkdirSync(path.join(source,'图标'),{recursive:true});fs.writeFileSync(path.join(source,'manifest.json'),'{"name":"合成扩展"}');fs.writeFileSync(path.join(source,'图标','图标.png'),Buffer.from([0,255,9,128]));return {root,source,output:path.join(root,'目标 扩展')};}
test('extension copy preserves nested Unicode paths and exact binary bytes without fs.cpSync',t=>{
 const {source,output}=fixture(t);copyExtensionTree(source,output);
 assert.deepEqual(fs.readFileSync(path.join(output,'图标','图标.png')),Buffer.from([0,255,9,128]));assert.equal(fs.readFileSync(path.join(output,'manifest.json'),'utf8'),'{"name":"合成扩展"}');
});
test('extension copy refuses an existing destination and keeps its files intact',t=>{
 const {source,output}=fixture(t);fs.mkdirSync(output);fs.writeFileSync(path.join(output,'keep'),'original');assert.throws(()=>copyExtensionTree(source,output),/EEXIST/);assert.equal(fs.readFileSync(path.join(output,'keep'),'utf8'),'original');
});
test('extension copy rejects source links instead of reading outside the approved tree',{skip:process.platform==='win32'},t=>{
 const {root,source,output}=fixture(t);const outside=path.join(root,'outside');fs.writeFileSync(outside,'private');fs.symlinkSync(outside,path.join(source,'escape'));assert.throws(()=>copyExtensionTree(source,output),/符号链接/);assert.equal(fs.existsSync(path.join(output,'escape')),false);
});
