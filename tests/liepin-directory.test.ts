import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
// @ts-expect-error Native ESM distribution helper.
import {replaceDirectory} from '../distribution/liepin-search/directory-distribution.mjs';

test('installed runtime links survive removal of the extracted package',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-portable-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'extracted'),destination=path.join(root,'installed');
 fs.mkdirSync(path.join(source,'node_modules','.bin'),{recursive:true});
 fs.mkdirSync(path.join(source,'packages','liepin'),{recursive:true});
 fs.writeFileSync(path.join(source,'packages','liepin','main.js'),'installed');
 fs.symlinkSync('../../packages/liepin/main.js',path.join(source,'node_modules','.bin','cli'));
 fs.symlinkSync('../packages/liepin',path.join(source,'node_modules','liepin'));
 replaceDirectory(source,destination);
 fs.rmSync(source,{recursive:true});
 assert.equal(fs.readlinkSync(path.join(destination,'node_modules','.bin','cli')),'../../packages/liepin/main.js');
 assert.equal(fs.readFileSync(path.join(destination,'node_modules','.bin','cli'),'utf8'),'installed');
 assert.equal(fs.readFileSync(path.join(destination,'node_modules','liepin','main.js'),'utf8'),'installed');
});

for (const failure of ['copy','switch','none']) test(`runtime upgrade preserves availability: ${failure}`,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-upgrade-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'new'),destination=path.join(root,'runtime');
 fs.mkdirSync(source);fs.mkdirSync(destination);
 fs.writeFileSync(path.join(source,'version'),'new');fs.writeFileSync(path.join(destination,'version'),'old');
 const io={...fs,
  cpSync:(from:string,to:string,options:fs.CopySyncOptions)=>{
   if(failure==='copy'){fs.mkdirSync(to);fs.writeFileSync(path.join(to,'partial'),'x');throw new Error('copy interrupted');}
   fs.cpSync(from,to,options);
  },
  renameSync:(from:string,to:string)=>{
   if(failure==='switch' && from.includes('.install-'))throw new Error('switch failed');
   fs.renameSync(from,to);
  },
 };
 if(failure==='none'){
  const previous=replaceDirectory(source,destination,io);
  assert.equal(fs.readFileSync(path.join(destination,'version'),'utf8'),'new');
  assert.equal(fs.readFileSync(path.join(previous,'version'),'utf8'),'old');
 }else{
  assert.throws(()=>replaceDirectory(source,destination,io));
  assert.equal(fs.readFileSync(path.join(destination,'version'),'utf8'),'old');
 }
 assert.ok(!fs.readdirSync(root).some(name=>name.includes('.install-')));
});
