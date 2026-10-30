import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compile,execute,normalize,validateTask,runProcess} from '../src/linkedin/gateway.mjs';
const account={profile:'synthetic-integration-test',expected_identity:'Test User',expected_profile_url:'https://www.linkedin.com/in/test-user/'};
// Synthetic runs must never read or leave locks in the shared system tmp dir.
const lockRoot=await mkdtemp(join(tmpdir(),'hunter-gateway-lock-'));
after(()=>rm(lockRoot,{recursive:true,force:true}));
const opts=extra=>({linkedinEntry:'/tmp/launcher.mjs',profileLockRoot:lockRoot,...extra});
const request={provider:'salesnav',operation:'company.search',account,input:{keywords:'dental',limit:25}};
test('task distinguishes qualified goal and preserves criteria',()=>{const task={task_id:'t',intent:'company_discovery',criteria:[{description:'variable requirement',strength:'required'}],target:{count:100,meaning:'qualified'}};assert.deepEqual(validateTask(task).task,task);assert.throws(()=>validateTask({...task,target:{count:100}}));});
test('SalesNav parameters preserved and account cannot be overridden',()=>{const p=compile(request);assert.deepEqual(JSON.parse(p.args[2]),{...request.input,...account});assert.throws(()=>compile({...request,input:{profile:'other'}}),{code:'binding_override'});});
test('unsupported provider, writes and ordinary advanced filters fail before dispatch',()=>{assert.throws(()=>compile({...request,operation:'message.send'}));assert.throws(()=>compile({...request,provider:'linkedin',operation:'person.search',input:{keyword:'engineer',headcount:'51-200'}},{linkedinEntry:'/tmp/launcher.mjs'}),{code:'unsupported_parameter'});});
test('shell characters remain literal argv, profile explicitly bound',()=>{const p=compile({...request,provider:'linkedin',operation:'person.search',input:{keyword:'$(touch /tmp/no)'}},{linkedinEntry:'/tmp/launcher.mjs'});assert.ok(p.args.includes('$(touch /tmp/no)'));assert.deepEqual(p.args.slice(1,3),['--profile',account.profile]);});
test('browser command timeout follows the operation budget and never drops below 60s',async()=>{
 const plan={executable:process.execPath,args:['-e','console.log(JSON.stringify({v:process.env.OPENCLI_BROWSER_COMMAND_TIMEOUT}))'],provider:'linkedin'};
 assert.equal((await runProcess(plan,{timeoutMs:120000})).v,'120');
 assert.equal((await runProcess(plan,{timeoutMs:999999})).v,'300');
 assert.equal((await runProcess(plan,{timeoutMs:5000})).v,'60');
});
test('mismatched identity prevents ordinary search',async()=>{let calls=0;await assert.rejects(execute({...request,provider:'linkedin',operation:'person.search',input:{keyword:'engineer'}},opts({run:async()=>{calls++;return {ok:true,data:{logged_in:true,name:'Other',public_id:'test-user'}};}})),{code:'identity_unconfirmed'});assert.equal(calls,1);});
test('matched identity invokes search once after check',async()=>{let calls=0;const r=await execute({...request,provider:'linkedin',operation:'person.search',input:{keyword:'engineer'}},opts({run:async()=>++calls===1?{ok:true,data:[{logged_in:true,name:'Test User',public_id:'test-user'}]}:{ok:true,data:{results:[]}}}));assert.equal(calls,2);assert.equal(r.qualification,'not_evaluated');});
test('partial results and provider-bound cursor retained',()=>{const r=normalize(request,{ok:true,data:{results:[{id:'x'}],completeness:'partial',cursor:'opaque',pagination:{total_text:'1K+'}}});assert.equal(r.status,'partial');assert.equal(r.coverage.total_text,'1K+');assert.equal(r.resume.provider,'salesnav');assert.equal(r.data.results.length,1);});
test('upstream denial is blocked without fallback',async()=>{let calls=0;const r=await execute(request,opts({run:async()=>{calls++;return {ok:false,error:{code:'access_denied'}};}}));assert.equal(r.status,'blocked');assert.equal(calls,1);});
test('account fields cannot silently replace search parameters',()=>{assert.throws(()=>compile({...request,account:{...account,keywords:'other'}}),{code:'unsupported_account_field'});});
test('successful diagnostic with mismatched identity is blocked',()=>{const r=normalize({...request,operation:'account.inspect'},{ok:true,data:{identity_match:false,account_binding:{status:'unknown'}}});assert.equal(r.status,'blocked');assert.equal(r.error.code,'identity_unconfirmed');});
test('cursor and truncation do not imply complete collection',()=>{assert.equal(normalize(request,{ok:true,data:{cursor:'opaque'}}).status,'partial');assert.equal(normalize(request,{ok:true,data:{truncated:true}}).status,'partial');});
test('empty success envelope is rejected',()=>assert.throws(()=>normalize(request,{ok:true}),{code:'invalid_response'}));
test('ordinary live-shaped profile rows enter common results without inventing missing sections',()=>{
 const r=normalize({...request,provider:'linkedin',operation:'person.read'},{ok:true,data:[{name:'Test',profile_url:'https://www.linkedin.com/in/test/?isSelfProfile=true',about:'',experience:''}]});
 assert.equal(r.data.results[0].url,'https://www.linkedin.com/in/test/');assert.equal(r.status,'partial');assert.equal(r.data.results[0].raw.profile_url.includes('?'),true);
});
test('ordinary nested failure stays blocked with upstream reason',()=>{
 const r=normalize({provider:'linkedin',operation:'person.search'},{ok:true,data:{success:false,error:'linkedin_sales_pitch',details:{resultItems:0}}});
 assert.equal(r.status,'blocked');assert.equal(r.error.code,'linkedin_sales_pitch');assert.equal(r.resume,null);
});
test('ordinary scout candidates retain metadata and unknown coverage is partial',()=>{
 const r=normalize({provider:'linkedin',operation:'person.search'},{ok:true,data:{meta:{requestedLimit:3},candidates:[{profileId:'x',name:'Fixture',profileUrl:'https://www.linkedin.com/in/fixture/'}]}});
 assert.equal(r.data.results[0].id,'x');assert.equal(r.data.meta.requestedLimit,3);assert.equal(r.status,'partial');
});
test('ordinary company uses required positional argument; no SalesNav dependency',()=>{
 const p=compile({provider:'linkedin',operation:'company.read',account,input:{company:'fixture'}},{linkedinEntry:'/tmp/launcher.mjs'});
 assert.deepEqual(p.args.slice(3,6),['linkedin','company','fixture']);
 assert.throws(()=>compile({provider:'linkedin',operation:'company.read',account,input:{company:'https://evil.test/company/x'}},{linkedinEntry:'/tmp/launcher.mjs'}),{code:'invalid_company'});
});
test('experience rows remain one person, preserve raw sections, reject wrong identity',()=>{
 const r={provider:'linkedin',operation:'person.experience',account,input:{profile_url:'https://www.linkedin.com/in/fixture/'}};
 const rows=[{profile_url:r.input.profile_url,title:'Role A'},{profile_url:r.input.profile_url,title:'Role B'}];
 const n=normalize(r,{ok:true,data:rows});assert.equal(n.data.results.length,1);assert.equal(n.data.section_count,2);assert.deepEqual(n.data.results[0].experience,rows);
 assert.throws(()=>normalize(r,{ok:true,data:[{profile_url:'https://www.linkedin.com/in/other/'}]}),{code:'profile_identity_mismatch'});
});
test('unavailable company pages are rejected even when upstream envelope reports success',()=>{
 const req={provider:'linkedin',operation:'company.read',account,input:{company:'example'}};
 for(const url of ['https://www.linkedin.com/company/unavailable/','https://www.linkedin.com/company/unavailable/about/'])assert.throws(()=>normalize(req,{ok:true,data:[{name:'0 notifications',url}]}),{code:'company_unavailable'});
});
test('company details retain verified about page source URLs',()=>{
 const r=normalize({provider:'linkedin',operation:'company.read',account,input:{company:'fixture'}},{ok:true,data:[{name:'Fixture',url:'https://www.linkedin.com/company/fixture/about/'}]});
 assert.equal(r.status,'completed');assert.equal(r.data.results[0].url,'https://www.linkedin.com/company/fixture/about/');
});

test('ordinary paging accepts 200, preserves filters and compiles provider-specific cursor',()=>{
 const input={keyword:'engineer',location:'Singapore',limit:200,max_pages:3,cursor:'/tmp/ordinary-query.json'};
 const req={provider:'linkedin',operation:'search.next',account,input};
 const p=compile(req,{linkedinEntry:'/tmp/launcher.mjs'});
 assert.ok(p.args.includes('--maxPages'));assert.ok(p.args.includes('--cursor'));assert.ok(p.args.includes('200'));
 const n=normalize(req,{ok:true,data:{operation:'ordinary-people-search',query_fingerprint:'fixture',candidates:[],cursor:'/tmp/next.json',completeness:'partial',stop_reason:'page_limit'}});
 assert.equal(n.resume.provider,'linkedin');assert.equal(n.resume.input.location,'Singapore');assert.equal(n.resume.input.keyword,'engineer');assert.equal(n.resume.input.cursor,'/tmp/next.json');
 assert.throws(()=>compile({...req,input:{...input,max_pages:0}},{linkedinEntry:'/tmp/launcher.mjs'}),{code:'invalid_page_limit'});
 assert.throws(()=>compile({...req,input:{keyword:'engineer'}},{linkedinEntry:'/tmp/launcher.mjs'}),{code:'search_cursor_required'});
});

test('failed account check and platform operation retain the failing stage',async()=>{
 const req={provider:'linkedin',operation:'person.search',account,input:{keyword:'engineer'}};
 await assert.rejects(execute(req,opts({run:async()=>{throw Object.assign(new Error('timeout'),{code:'execution_outcome_unknown'});}})),{code:'execution_outcome_unknown',stage:'account_check'});
 let count=0;
 // The first run intentionally retains an unknown-outcome lock; use a distinct profile for the next stage.
 await assert.rejects(execute({...req,account:{...account,profile:'synthetic-platform-stage'}},opts({run:async()=>{if(++count===1)return {ok:true,data:{logged_in:true,name:'Test User',public_id:'test-user'}};throw Object.assign(new Error('failed'),{code:'attach_failed'});}})),{code:'attach_failed',stage:'platform_operation'});
});
test('non-ASCII profile bindings compile in raw and percent-encoded form',()=>{
 const binding={...account,expected_profile_url:'https://www.linkedin.com/in/妍-王-a52634337/'};
 assert.ok(compile({...request,account:binding},{linkedinEntry:'/tmp/launcher.mjs'}));
 assert.ok(compile({...request,account:{...binding,expected_profile_url:'https://www.linkedin.com/in/%E5%A6%8D-%E7%8E%8B-a52634337/'}},{linkedinEntry:'/tmp/launcher.mjs'}));
});
test('percent-encoded binding confirms the raw non-ASCII public id',async()=>{
 const binding={profile:'synthetic-unicode-binding',expected_identity:'Jazmín Wang',expected_profile_url:'https://www.linkedin.com/in/%E5%A6%8D-%E7%8E%8B-a52634337/'};
 let calls=0;
 const r=await execute({provider:'linkedin',operation:'person.search',account:binding,input:{keyword:'engineer'}},opts({run:async()=>++calls===1?{ok:true,data:[{logged_in:true,name:'Jazmín Wang',public_id:'妍-王-a52634337'}]}:{ok:true,data:{candidates:[]}}}));
 assert.equal(calls,2);
 assert.equal(r.provider,'linkedin');
});
test('person.read accepts an encoded row for a raw non-ASCII profile url',()=>{
 const r=normalize({...request,provider:'linkedin',operation:'person.read',input:{profile_url:'https://www.linkedin.com/in/妍-王-a52634337/'}},{ok:true,data:[{name:'Jazmín Wang',profile_url:'https://www.linkedin.com/in/%E5%A6%8D-%E7%8E%8B-a52634337/',about:'bio'}]});
 assert.equal(r.data.results.length,1);
});
