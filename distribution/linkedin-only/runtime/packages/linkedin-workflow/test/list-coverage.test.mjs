import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateTask} from '../src/linkedin/gateway.mjs';
import {createTask,taskExecute,taskStatus,taskAssess,taskReport} from '../src/linkedin/task-store.mjs';
const task={task_id:'coverage',intent:'people_discovery',criteria:[],target:{count:1,meaning:'candidates'},coverage:{mode:'target_only',min_unique_people:200}};
const account={profile:'synthetic',expected_identity:'Test User',expected_profile_url:'https://www.linkedin.com/in/test/'};
const request={provider:'salesnav',operation:'person.search',account,input:{keywords:'synthetic',limit:200}};
const rows=(a,b)=>Array.from({length:b-a},(_,i)=>({id:String(a+i),name:`Synthetic ${a+i}`}));
test('explicit lower coverage accepted; invalid and company coverage rejected',()=>{
 assert.doesNotThrow(()=>validateTask({...task,coverage:{mode:'target_only',min_unique_people:50}}));
 for(const n of [0,-1,1.5,'200'])assert.throws(()=>validateTask({...task,coverage:{mode:'target_only',min_unique_people:n}}),{code:'invalid_coverage'});
 assert.throws(()=>validateTask({...task,intent:'company_discovery'}),{code:'invalid_coverage'});
});
test('deduped list coverage gates early target completion and excludes detail-only records',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'list-coverage-'));t.after(()=>rm(directory,{recursive:true,force:true}));const ref={directory,task_id:task.task_id};await createTask({...ref,task});
 const run=(id,results,req=request)=>taskExecute({...ref,operation_id:id,request:req},{execute:async()=>({status:'completed',data:{results}})});
 const report=async id=>{await taskAssess({...ref,assessment_id:id,assessments:[]});return taskReport({...ref,assessment_id:id,report_id:id});};
 await run('first',rows(0,50));assert.equal((await report('r1')).status,'partial');
 await run('second',rows(10,190));assert.equal((await taskStatus(ref)).list_coverage.unique_people,190);
 await run('detail',rows(300,301),{...request,operation:'person.read',input:{url:'https://www.linkedin.com/in/fixture/'}});
 assert.equal((await taskStatus(ref)).list_coverage.unique_people,190);assert.equal((await report('r2')).list_coverage.remaining,10);
 await run('last',rows(190,200));assert.equal((await report('r3')).status,'completed');
});
test('exhausted results and budget stop retain coverage gap',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'list-gap-'));t.after(()=>rm(directory,{recursive:true,force:true}));const ref={directory,task_id:task.task_id};await createTask({...ref,task:{...task,budgets:{max_operations:1}}});
 await taskExecute({...ref,operation_id:'only',request},{execute:async()=>({status:'completed',data:{operation:'lead-search',query_fingerprint:'fixture',completeness:'complete',results:rows(0,83)}})});
 await taskAssess({...ref,assessment_id:'a',assessments:[]});const r=await taskReport({...ref,assessment_id:'a',report_id:'r'});assert.equal(r.status,'partial');assert.equal(r.list_coverage.remaining,117);
 await assert.rejects(taskExecute({...ref,operation_id:'extra',request}),{code:'task_budget_exhausted'});
});
