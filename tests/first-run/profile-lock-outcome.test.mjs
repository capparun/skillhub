import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withProfileLock,inspectProfileLock} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/profile-lock.mjs';
for(const mode of ['timeout','returned_unknown','success','known_rejection'])test(`profile exclusion respects operation outcome: ${mode}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'profile-outcome-'));
 try{
  const work=async()=>{
   if(mode==='timeout')throw Object.assign(Error('timeout'),{code:'execution_outcome_unknown'});
   if(mode==='known_rejection')throw Object.assign(Error('identity'),{code:'identity_unconfirmed'});
   return mode==='returned_unknown'?{recovery:{execution_state:'unknown'}}:{status:'completed'};
  };
  if(mode==='timeout'||mode==='known_rejection')await assert.rejects(withProfileLock('fixture',work,root));
  else await withProfileLock('fixture',work,root);
  const state=await inspectProfileLock('fixture',root);
  if(mode==='timeout'||mode==='returned_unknown'){
   assert.equal(state.owner.execution_state,'unknown');assert.equal(state.owner.reason,'execution_outcome_unknown');
   let dispatched=false;
   await assert.rejects(withProfileLock('fixture',async()=>{dispatched=true;},root),{code:'profile_busy'});
   assert.equal(dispatched,false);
  }else assert.equal(state.status,'absent');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('explicit profile recovery archives only a confirmed exited owner',async()=>{
 const {spawnSync}=await import('node:child_process');
 const {readFile}=await import('node:fs/promises');
 const {recoverProfileLock}=await import('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/profile-lock.mjs');
 const root=await mkdtemp(join(tmpdir(),'profile-recovery-'));
 const moduleUrl=new URL('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/profile-lock.mjs',import.meta.url).href;
 try{
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {withProfileLock} from ${JSON.stringify(moduleUrl)};await withProfileLock('fixture',async()=>({recovery:{execution_state:'unknown'}}),process.argv[1]);`,root],{encoding:'utf8',timeout:5000});
  assert.equal(child.status,0,child.stderr);
  const state=await inspectProfileLock('fixture',root);assert.equal(state.status,'owner_exited');
  await assert.rejects(recoverProfileLock({profile:'fixture',revision:state.revision},root),{code:'execution_stop_confirmation_required'});
  await assert.rejects(recoverProfileLock({profile:'fixture',revision:'stale',execution_stopped_confirmed:true},root),{code:'lock_changed'});
  await assert.rejects(recoverProfileLock({profile:'../other',execution_stopped_confirmed:true},root),{code:'invalid_profile'});
  const result=await recoverProfileLock({profile:'fixture',revision:state.revision,execution_stopped_confirmed:true},root);
  assert.equal(result.status,'recovered');assert.equal(result.dispatched,false);
  assert.equal(JSON.parse(await readFile(result.archive,'utf8')).execution_state,'unknown');
  assert.equal((await inspectProfileLock('fixture',root)).status,'absent');
  assert.equal(await withProfileLock('fixture',async()=>42,root),42);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('gateway normalized stale-page response retains profile exclusion',async()=>{
 const {normalize}=await import('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/gateway.mjs');
 const root=await mkdtemp(join(tmpdir(),'profile-normalized-'));
 try{
  const result=await withProfileLock('fixture',async()=>normalize({provider:'linkedin',operation:'person.experience'},
   {ok:false,error:{code:'UNKNOWN',message:'Page not found — stale page identity'}}),root);
  assert.equal(result.error.code,'page_session_invalidated');
  const lock=await inspectProfileLock('fixture',root);
  assert.equal(lock.owner.execution_state,'unknown');assert.equal(lock.owner.reason,'page_session_invalidated');
  await assert.rejects(withProfileLock('fixture',async()=>assert.fail('must not dispatch'),root),{code:'profile_busy'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('product CLI exposes profile diagnosis and rejects unconfirmed recovery',async()=>{
 const {spawnSync}=await import('node:child_process');
 const {writeFile}=await import('node:fs/promises');
 const {randomUUID}=await import('node:crypto');
 const {fileURLToPath}=await import('node:url');
 const root=await mkdtemp(join(tmpdir(),'profile-cli-'));
 const entry=fileURLToPath(new URL('../../distribution/linkedin-only/runtime/opencli.mjs',import.meta.url));
 try{
  const input=join(root,'input.json');await writeFile(input,JSON.stringify({profile:'test-'+randomUUID(),execution_stopped_confirmed:false}));
  const invoke=name=>spawnSync(process.execPath,[entry,'hunter-linkedin',name,'--input',input,'-f','json'],{encoding:'utf8',timeout:10000});
  const inspect=invoke('profile-lock-inspect');assert.equal(inspect.status,0,inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).data.status,'absent');
  const recover=invoke('profile-lock-recover');assert.notEqual(recover.status,0);
  assert.equal(JSON.parse(recover.stdout).error.code,'execution_stop_confirmation_required');
 }finally{await rm(root,{recursive:true,force:true});}
});

for(const code of ['command_result_unknown','command_lost','result_evicted'])test(`upstream ${code} inside partial output retains lock`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'profile-upstream-'));
 try{
  const result={status:'partial',data:{candidates:[],interruption:{code}}};
  assert.equal(await withProfileLock('fixture',async()=>result,root),result);
  assert.equal((await inspectProfileLock('fixture',root)).owner.reason,code);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('unknown reason follows cyclic causes but ignores business data',async()=>{
 const {unknownExecutionReason}=await import('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/profile-lock.mjs');
 const error=new Error('wrapped');error.cause={code:'command_lost',cause:error};
 assert.equal(unknownExecutionReason(error),'command_lost');
 const cycle={};cycle.cause=cycle;assert.equal(unknownExecutionReason(cycle),null);
 assert.equal(unknownExecutionReason({data:{candidates:[{code:'command_lost'}]}}),null);
 assert.equal(unknownExecutionReason({data:{interruption:{code:'profile_identity_unavailable'}}}),null);
});
