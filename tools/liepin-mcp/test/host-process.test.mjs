import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
test('launcher forwards termination to its child and exits with child status',{skip:process.platform==='win32',timeout:5000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'host-process-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const childFile=path.join(root,'child.mjs'),marker=path.join(root,'terminated');
 fs.writeFileSync(childFile,`import fs from 'node:fs';process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(marker)},'yes');process.exit(7);});console.log('READY');setInterval(()=>{},1000);`);
 const supervisor=new URL('../lib/host-process.mjs',import.meta.url).href;
 const launcher=spawn(process.execPath,['--input-type=module','-e',`import {runHostProcess} from ${JSON.stringify(supervisor)};runHostProcess(${JSON.stringify(childFile)},[]);`],{stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(launcher.exitCode===null)launcher.kill('SIGKILL');});
 const exited=new Promise((resolve,reject)=>{launcher.once('exit',resolve);launcher.once('error',reject);});
 await new Promise((resolve,reject)=>{
  let output='',errors='';
  launcher.stderr.on('data',data=>{errors+=data.toString();});
  const prematureExit=code=>reject(Error(`launcher exited before READY (${code}): ${errors}`));
  launcher.once('exit',prematureExit);launcher.once('error',reject);
  launcher.stdout.on('data',data=>{output+=data.toString();if(output.includes('READY')){launcher.off('exit',prematureExit);resolve();}});
 });
 launcher.kill('SIGTERM');assert.equal(await exited,7);assert.equal(fs.readFileSync(marker,'utf8'),'yes');
});
