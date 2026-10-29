import {lockOwner,inspectLock,recoverLock} from './lock-health.mjs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// OpenCLI 2.0.1 daemon-client marks these outcomes as unsafe to replay.
const unknownCodes=new Set(['command_result_unknown','command_lost','result_evicted',
 'execution_outcome_unknown','runtime_failure','page_session_invalidated','cleanup_failed','bridge_timeout','bridge_failure']);
export function unknownExecutionReason(value){
 const seen=new Set(),queue=[value];
 while(queue.length){
  const node=queue.shift();
  if(!node||typeof node!=='object'||seen.has(node))continue;
  seen.add(node);
  if(unknownCodes.has(node.code))return node.code;
  if(unknownCodes.has(node.error?.code))return node.error.code;
  if(node.recovery?.execution_state==='unknown')return 'execution_outcome_unknown';
  // Traverse only execution envelopes, never arbitrary candidate/profile fields.
  for(const key of ['cause','error','interruption','data'])if(node[key])queue.push(node[key]);
 }
 return null;
}

// Inter-process exclusion for this plugin only, not a lock on manual Chrome use.
// Never steal a stale lock automatically: a timed-out browser action may still run.
export async function withProfileLock(profile, work, root = join(tmpdir(), 'hunter-salesnav-locks')) {
  if (typeof profile !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(profile)) throw new Error('Invalid profile');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, `${createHash('sha256').update(profile).digest('hex')}.lock`);
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('Profile is already in use by this plugin.'), { code: 'profile_busy' });
    throw error;
  }
  const owner=lockOwner();
  let retain=false;
  const preserve=async reason=>{
    retain=true;
    await handle.truncate(0);
    await handle.write(JSON.stringify({...owner,execution_state:'unknown',reason}),0,'utf8');
    await handle.sync();
  };
  try {
    await handle.writeFile(JSON.stringify(owner));
    const result=await work();
    const reason=unknownExecutionReason(result);
    if(reason)await preserve(reason);
    return result;
  } catch(error) {
    const reason=unknownExecutionReason(error);
    if(reason)await preserve(reason);
    throw error;
  } finally { await handle.close(); if(!retain)await unlink(path); }
}

export async function inspectProfileLock(profile,root=join(tmpdir(),'hunter-salesnav-locks')){
 if(typeof profile!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(profile))throw Object.assign(Error('invalid_profile'),{code:'invalid_profile'});
 return inspectLock(join(root,`${createHash('sha256').update(profile).digest('hex')}.lock`));
}

export async function recoverProfileLock(input,root=join(tmpdir(),'hunter-salesnav-locks')){
 const profile=input?.profile;
 if(typeof profile!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(profile))throw Object.assign(Error('invalid_profile'),{code:'invalid_profile'});
 return recoverLock(join(root,`${createHash('sha256').update(profile).digest('hex')}.lock`),{
  revision:input.revision,execution_stopped_confirmed:input.execution_stopped_confirmed
 });
}
