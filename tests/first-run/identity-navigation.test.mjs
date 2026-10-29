import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeIdentity,validateIdentityTarget} from '../../distribution/linkedin-only/runtime/packages/hunter-linkedin/lib/identity-probe.js';
import {execute,normalize} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/gateway.mjs';
const target='https://www.linkedin.com/in/candidate/';
for(const origin of ['https://www.linkedin.com','about:blank'])test(`identity probe navigation from ${origin}`,async()=>{
 const navigations=[];let reads=0;
 const page={getCookies:async()=>[{name:'li_at',value:'fixture'}],goto:async url=>navigations.push(url),evaluate:async()=>++reads===1?{origin,path:'/in/previous/'}:{logged_in:true,public_id:'self',name:'Self'}};
 assert.equal((await probeIdentity(page,target)).public_id,'self');
 assert.deepEqual(navigations,origin==='about:blank'?[target]:[]);
});
test('missing session and login page never navigate or issue identity API read',async()=>{
 let reads=0;
 const page={getCookies:async()=>[],goto:async()=>assert.fail('unexpected navigation'),evaluate:async()=>{reads++;return {origin:'https://www.linkedin.com',path:'/login'};}};
 await assert.rejects(probeIdentity(page,target),{code:'not_logged_in'});assert.equal(reads,0);
 page.getCookies=async()=>[{name:'li_at',value:'fixture'}];
 await assert.rejects(probeIdentity(page,target),{code:'login_required'});assert.equal(reads,1);
 assert.throws(()=>validateIdentityTarget('https://example.com/'),{code:'invalid_identity_target'});
});
test('sequential profile reads use fresh identity-check instead of feed whoami; changed account blocks',async()=>{
 const account={profile:'navigation-fixture',expected_identity:'Self',expected_profile_url:'https://www.linkedin.com/in/self/'};
 const request={provider:'linkedin',operation:'person.read',account,input:{profile_url:target}};
 let calls=0,switched=false;const plans=[];
 const options={linkedinEntry:'/tmp/fixture.mjs',run:async plan=>{
  plans.push(plan);calls++;
  if(plan.args.includes('identity-check'))return {ok:true,data:{logged_in:true,name:'Self',public_id:switched?'other':'self'}};
  return {ok:true,data:[{profile_url:target,about:'Fixture'}]};
 }};
 await execute(request,options);await execute(request,options);
 assert.equal(calls,4);assert.equal(plans.filter(p=>p.args.includes('whoami')).length,0);
 assert.equal(plans.filter(p=>p.args.includes('identity-check')).length,2);
 assert.ok(plans[0].args.includes(target));
 switched=true;await assert.rejects(execute(request,options),{code:'identity_unconfirmed'});assert.equal(calls,5);
});

test('actual browser probe expression reads current account and rejects expired login',async()=>{
 const {runInNewContext}=await import('node:vm');let status=200,requests=0;
 const sandbox={location:{origin:'https://www.linkedin.com',pathname:'/in/candidate/'},document:{cookie:'JSESSIONID="fixture-csrf"'},fetch:async(url,options)=>{
  requests++;assert.equal(url,'/voyager/api/me');assert.equal(options.headers['csrf-token'],'fixture-csrf');
  return {status,ok:status===200,json:async()=>({miniProfile:{publicIdentifier:'self',firstName:{text:'Self'},lastName:'User'}})};
 }};
 const page={getCookies:async()=>[{name:'li_at',value:'fixture'}],goto:async()=>assert.fail('must not navigate'),evaluate:code=>runInNewContext(code,sandbox)};
 assert.equal((await probeIdentity(page,target)).name,'Self User');
 status=401;await assert.rejects(probeIdentity(page,target),{code:'not_logged_in'});
 assert.equal(requests,2);
});

test('target profile mismatch is rejected after account identity check',()=>{
 const request={provider:'linkedin',operation:'person.read',input:{profile_url:target}};
 assert.throws(()=>normalize(request,{ok:true,data:[{profile_url:'https://www.linkedin.com/in/wrong/',about:'wrong'}]}),{code:'profile_identity_mismatch'});
 assert.equal(normalize(request,{ok:true,data:[{profile_url:target+'?source=fixture',about:'ok'}]}).data.results[0].url,target);
});

test('stale page identity is actionable but never treated as safe retry or empty result',()=>{
 const raw={ok:false,error:{code:'UNKNOWN',message:'Page not found: fixture — stale page identity',exitCode:1}};
 const result=normalize({provider:'linkedin',operation:'person.experience'},raw);
 assert.equal(result.status,'blocked');assert.equal(result.error.code,'page_session_invalidated');
 assert.deepEqual(result.error.upstream,raw.error);assert.equal(result.resume,null);
 assert.equal(result.recovery.automatic_retry,false);assert.equal(result.recovery.execution_state,'unknown');
 assert.equal(result.coverage.returned_count,null);
});
