import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findPackageRoot} from '../../distribution/linkedin-only/package-root.mjs';
for (const layout of ['flat','wrapped','ambiguous','missing']) {
 test(`package layout: ${layout}`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'package-root-test-'));
 try {
 const add=(name)=>{const d=path.join(root,name);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'install.mjs'),'');return d;};
 if(layout==='flat')assert.equal(findPackageRoot(add('')),root);
 if(layout==='wrapped'){const d=add('package');assert.equal(findPackageRoot(root),d);}
 if(layout==='ambiguous'){add('a');add('b');assert.throws(()=>findPackageRoot(root),/唯一/);}
 if(layout==='missing')assert.throws(()=>findPackageRoot(root),/唯一/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
}
