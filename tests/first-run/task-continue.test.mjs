import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTask,taskExecute,taskContinue} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/task-store.mjs';
test('continuation picks saved cursor; replay does not dispatch; concurrent request is blocked',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'continue-'));
 try{
 const input={directory,task_id:'test'};
 await createTask({directory,task:{task_id:'test',intent:'people_discovery',criteria:[],target:{count:300,meaning:'candidates'},budgets:{max_operations:5,max_pages:10}}});
 const request={provider:'linkedin',operation:'person.search',account:{profile:'fixture',expected_identity:'Test',expected_profile_url:'https://www.linkedin.com/in/test/'},input:{keyword:'engineer',limit:50,max_pages:2}};
 await taskExecute({...input,operation_id:'first',request},{linkedinEntry:'/tmp/fixture.mjs',execute:async()=>({status:'partial',data:{results:[]},resume:{...request,operation:'search.next',input:{...request.input,cursor:'/tmp/cursor-one'}}})});
 let calls=0,release,started;
 const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const options={linkedinEntry:'/tmp/fixture.mjs',execute:async r=>{calls++;assert.equal(r.input.cursor,'/tmp/cursor-one');assert.equal(r.input.limit,300);assert.equal(r.input.max_pages,2);started();await gate;return {status:'partial',data:{results:[]},resume:{...r,input:{...r.input,cursor:'/tmp/cursor-two'}}};}};
 const running=taskContinue({...input,operation_id:'next'},options);await ready;
 await assert.rejects(taskContinue({...input,operation_id:'concurrent'},options),{code:'task_busy'});
 release();await running;
 const replay=await taskContinue({...input,operation_id:'next'},options);assert.equal(replay.replayed,true);assert.equal(calls,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});

for(const scenario of ['latest_cursor','budget','interrupted'])test(scenario,async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'continue-chain-'));
 try{
 const input={directory,task_id:'chain'};
 await createTask({directory,task:{task_id:'chain',intent:'people_discovery',criteria:[],target:{count:300,meaning:'candidates'},budgets:{max_operations:scenario==='budget'?1:6,max_pages:10}}});
 const request={provider:'linkedin',operation:'person.search',account:{profile:'fixture',expected_identity:'Test',expected_profile_url:'https://www.linkedin.com/in/test/'},input:{keyword:'engineer',limit:50,max_pages:1}};
 let calls=0;
 const options={linkedinEntry:'/tmp/fixture.mjs',execute:async r=>{calls++;if(scenario==='interrupted'&&calls===2)throw Object.assign(Error('timeout'),{code:'execution_outcome_unknown'});if(calls===3)assert.equal(r.input.cursor,'/tmp/cursor-2');return {status:'partial',data:{results:[]},resume:{...r,operation:'search.next',input:{...r.input,cursor:'/tmp/cursor-'+calls}}};}};
 await taskExecute({...input,operation_id:'first',request},options);
 if(scenario==='budget'){await assert.rejects(taskContinue({...input,operation_id:'second'},options),{code:'task_budget_exhausted'});assert.equal(calls,1);}
 else{
 await taskContinue({...input,operation_id:'second'},options);
 if(scenario==='interrupted'){await assert.rejects(taskContinue({...input,operation_id:'third'},options),{code:'diagnosis_required'});assert.equal(calls,2);}
 else{await taskContinue({...input,operation_id:'third'},options);assert.equal(calls,3);}
 }
 }finally{await rm(directory,{recursive:true,force:true});}
});

for (const count of [1, 2]) test(`terminal result with ${count} people does not dispatch again`, async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(), 'continue-terminal-'));
 try {
  const input = { directory, task_id: 'terminal' };
  await createTask({ directory, task: { task_id: 'terminal', intent: 'people_discovery', criteria: [], target: { count: 2, meaning: 'candidates' }, budgets: { max_operations: 1, max_pages: 1 } } });
  const request = { provider: 'linkedin', operation: 'person.search', account: { profile: 'fixture', expected_identity: 'Test', expected_profile_url: 'https://www.linkedin.com/in/test/' }, input: { keyword: 'engineer', limit: 2, max_pages: 1 } };
  let calls = 0;
  const options = { linkedinEntry: '/tmp/fixture.mjs', execute: async () => {
   calls++;
   return { status: 'completed', data: { results: Array.from({ length: count }, (_, i) => ({ url: `https://www.linkedin.com/in/fixture-${i}/`, name: `Fixture ${i}` })) } };
  } };
  await taskExecute({ ...input, operation_id: 'first', request }, options);
  if (count === 2) assert.deepEqual(await taskContinue({ ...input, operation_id: 'next' }, options), { status: 'completed', dispatched: false, stop_reason: 'target_reached' });
  else await assert.rejects(taskContinue({ ...input, operation_id: 'next' }, options), { code: 'search_not_resumable' });
  assert.equal(calls, 1);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
