import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createTask,taskExecute,taskRecovery,taskContinue} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/task-store.mjs';
const cursorModule=new URL('../../distribution/linkedin-only/runtime/packages/hunter-linkedin/lib/ordinary-search-cursor.js',import.meta.url).href;
test('checkpoint survives worker termination and remains diagnostic until revalidated',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'task-checkpoint-'));
 try{
  const input={directory,task_id:'recovery'};
  await createTask({directory,task:{task_id:'recovery',intent:'people_discovery',criteria:[],target:{count:20,meaning:'candidates'},budgets:{max_operations:3,max_pages:4}}});
  const request={provider:'linkedin',operation:'person.search',account:{profile:'fixture',expected_identity:'Test',expected_profile_url:'https://www.linkedin.com/in/test/'},input:{keyword:'engineer',limit:20,max_pages:2}};
  await taskExecute({...input,operation_id:'first',request},{linkedinEntry:'/tmp/fixture.mjs',execute:async(_request,options)=>{
   const source=`import {publishSearchCheckpoint} from ${JSON.stringify(cursorModule)};publishSearchCheckpoint(${JSON.stringify(options.checkpointDirectory)},'/fixture/cursor.json',{page:2,results:[{}]});process.stdout.write('saved');setInterval(()=>{},1000);`;
   const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']});
   await once(child.stdout,'data');const exited=once(child,'exit');child.kill();await exited;
   await writeFile(join(options.checkpointDirectory,'incomplete.pending'),'{');
   throw Object.assign(Error('interrupted'),{code:'execution_outcome_unknown'});
  }});
  const recovery=await taskRecovery(input);
  assert.equal(recovery.status,'diagnosis_required');assert.equal(recovery.dispatched,false);
  assert.equal(recovery.search_checkpoints.length,1);
  assert.equal(recovery.search_checkpoints[0].next_page,2);
  assert.equal(recovery.search_checkpoints[0].collected_count,1);
  assert.equal(recovery.search_checkpoints[0].resumable,false);
  const journal=join(directory,'first.checkpoints');
  const validFile=(await readdir(journal)).find(f=>f.endsWith('.json'));
  const valid=JSON.parse(await readFile(join(journal,validFile),'utf8'));
  await writeFile(join(journal,'bad.json'),'{');
  await writeFile(join(journal,'dead.json'),JSON.stringify({...valid,collected_count:-1}));
  await writeFile(join(journal,validFile),JSON.stringify({...valid,operation_id:'other-task',resumable:true}));
  const checked=await taskRecovery(input);
  assert.equal(checked.search_checkpoints.length,1);
  assert.equal(checked.checkpoint_errors.length,2);
  assert.equal(checked.search_checkpoints[0].operation_id,'first');
  assert.equal(checked.search_checkpoints[0].resumable,false);
  await assert.rejects(taskContinue({...input,operation_id:'next'}),{code:'diagnosis_required'});
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('real gateway child timeout preserves task checkpoint without returning successful search',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'gateway-checkpoint-'));
 try{
  const input={directory,task_id:'gateway'};
  await createTask({directory,task:{task_id:'gateway',intent:'people_discovery',criteria:[],target:{count:20,meaning:'candidates'},budgets:{max_operations:2,max_pages:4,max_elapsed_seconds:2}}});
  const fixture=join(directory,'fixture.mjs');
  await writeFile(fixture,`
   import {publishSearchCheckpoint} from ${JSON.stringify(cursorModule)};
   if(process.argv.includes('whoami')||process.argv.includes('identity-check')) {
    if(process.env.HUNTER_SEARCH_CHECKPOINT_DIR)throw Error('checkpoint leaked to identity check');
    console.log(JSON.stringify({ok:true,data:{logged_in:true,name:'Fixture',public_id:'fixture'}}));
   } else {
    publishSearchCheckpoint(process.env.HUNTER_SEARCH_CHECKPOINT_DIR,'/fixture/saved.json',{page:2,results:[{}]});
    setInterval(()=>{},1000);
   }
  `);
  const request={provider:'linkedin',operation:'person.search',account:{profile:'fixture-'+Date.now(),expected_identity:'Fixture',expected_profile_url:'https://www.linkedin.com/in/fixture/'},input:{keyword:'engineer',limit:20,max_pages:2}};
  const result=await taskExecute({...input,operation_id:'timeout',request},{linkedinEntry:fixture,profileLockRoot:join(directory,'profile-locks')});
  assert.equal(result.status,'blocked');assert.equal(result.error.code,'execution_outcome_unknown');
  const recovery=await taskRecovery(input);
  assert.equal(recovery.search_checkpoints.length,1);
  assert.equal(recovery.search_checkpoints[0].next_page,2);
  assert.equal(recovery.search_checkpoints[0].operation_id,'timeout');
  assert.equal(recovery.status,'diagnosis_required');
  await assert.rejects(taskContinue({...input,operation_id:'retry'},{linkedinEntry:fixture}),{code:'diagnosis_required'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
