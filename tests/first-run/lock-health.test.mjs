import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {lockOwner,inspectLock,recoverLock} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/lock-health.mjs';
test('active, legacy, dead owner, stale revision and repeated recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lock-health-')),file=join(dir,'.task.lock');
 try{
 await writeFile(file,JSON.stringify(lockOwner()));let d=await inspectLock(file);assert.equal(d.status,'running');
 await assert.rejects(recoverLock(file,{revision:d.revision,execution_stopped_confirmed:true}),{code:'lock_not_recoverable'});
 await writeFile(file,'');assert.equal((await inspectLock(file)).status,'unknown');
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);const pid=child.pid;const exited=once(child,'exit');child.kill();await exited;
 await writeFile(file,JSON.stringify({pid,hostname:hostname()}));d=await inspectLock(file);assert.equal(d.status,'owner_exited');
 await assert.rejects(recoverLock(file,{revision:d.revision}),{code:'execution_stop_confirmation_required'});
 await assert.rejects(recoverLock(file,{revision:'stale',execution_stopped_confirmed:true}),{code:'lock_changed'});
 assert.equal((await recoverLock(file,{revision:d.revision,execution_stopped_confirmed:true})).status,'recovered');
 assert.equal((await recoverLock(file,{revision:d.revision,execution_stopped_confirmed:true})).status,'absent');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('legacy and malformed locks give actionable diagnostics without assuming safe recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lock-format-')),file=join(dir,'.task.lock');
 try{
  for(const [value,reason] of [[null,'invalid_lock_owner'],[[],'invalid_lock_owner'],[{pid:0},'invalid_owner_pid'],[{pid:123,created_at:'fixture'},'legacy_owner_host_unverified'],[{pid:123,hostname:'another-machine'},'foreign_owner_host']]){
   await writeFile(file,JSON.stringify(value));const state=await inspectLock(file);
   assert.equal(state.status,'unknown');assert.equal(state.reason,reason);
   await assert.rejects(recoverLock(file,{revision:state.revision,execution_stopped_confirmed:true}),{code:'lock_not_recoverable'});
  }
  await writeFile(file,JSON.stringify({...lockOwner(),unrelated_private_value:'do-not-return'}));
  assert.equal(Object.hasOwn((await inspectLock(file)).owner,'unrelated_private_value'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
