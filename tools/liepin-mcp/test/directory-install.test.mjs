import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {replaceDirectory} from '../../../distribution/liepin-search/directory-distribution.mjs';

for (const failure of ['copy', 'switch', 'none']) test(`customer directory replacement remains transactional: ${failure}`, t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'客户 安装-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),destination=path.join(root,'installed');
 fs.mkdirSync(path.join(source,'子目录'),{recursive:true});fs.mkdirSync(destination);
 fs.writeFileSync(path.join(source,'子目录','二进制'),Buffer.from([0,255,128]));
 fs.writeFileSync(path.join(destination,'old'),'original');
 const io={...fs,cpSync(){throw Error('recursive native copy must not run');},
  copyFileSync(from,to,flags){if(failure==='copy')throw Error('copy interrupted');fs.copyFileSync(from,to,flags);},
  renameSync(from,to){if(failure==='switch'&&from.includes('.install-'))throw Error('switch failed');fs.renameSync(from,to);}
 };
 if(failure==='none'){
  const backup=replaceDirectory(source,destination,io);
  assert.deepEqual(fs.readFileSync(path.join(destination,'子目录','二进制')),Buffer.from([0,255,128]));
  assert.equal(fs.readFileSync(path.join(backup,'old'),'utf8'),'original');
 }else{
  assert.throws(()=>replaceDirectory(source,destination,io),/copy interrupted|switch failed/);
  assert.equal(fs.readFileSync(path.join(destination,'old'),'utf8'),'original');
 }
 assert.equal(fs.readdirSync(root).some(name=>name.includes('.install-')),false);
});
