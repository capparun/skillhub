import test from 'node:test';import assert from 'node:assert/strict';
import {schoolSlug,resolveSchoolPage} from '../lib/school-lookup.js';
const snapshot=(html,url='https://www.linkedin.com/school/fixture/')=>({url,title:'Fixture',html});
test('lookup validates slug, full URL and home/about redirect forms',()=>{
  assert.equal(schoolSlug('fudan-university'),'fudan-university');
  assert.equal(schoolSlug('https://www.linkedin.com/school/fudan-university/'),'fudan-university');
  assert.equal(schoolSlug('https://www.linkedin.com/school/fudan-university/home/'),'fudan-university');
  assert.equal(schoolSlug('https://www.linkedin.com/school/fudan-university/about/'),'fudan-university');
  for(const value of ['Fudan University','https://evil.example/school/fudan-university/','../feed',''])assert.throws(()=>schoolSlug(value),{code:'invalid_school'});
});
test('ready page returns without fixed wait and prefers the target card',async()=>{
  const result=await resolveSchoolPage({evaluate:async()=>snapshot('<div id="pages.topCard.22859"></div> urn:li:organization:999','https://www.linkedin.com/school/fudan-university/home/')},'fudan-university',{wait:()=>{throw Error('unnecessary wait');}});
  assert.equal(result.schoolId,'22859');
  assert.equal(result.school,'fudan-university');
  assert.equal(result.identity_source,'page_top_card');
});
test('home redirect keeps the same school identity',async()=>{
  const result=await resolveSchoolPage({evaluate:async()=>snapshot('<div id="pages.topCard.22859"></div>','https://www.linkedin.com/school/fixture/home/')},'fixture');
  assert.equal(result.schoolId,'22859');
});
test('wrong page, auth wall and conflicting cards cannot report success',async()=>{
  for(const [value,code] of [
    [snapshot('urn:li:organization:123','https://www.linkedin.com/school/other/'),'school_identity_unconfirmed'],
    [snapshot('','https://www.linkedin.com/checkpoint/'),'school_access_blocked'],
    [snapshot('<div id="pages.topCard.123"></div><div id="pages.topCard.456"></div>'),'school_id_ambiguous'],
  ])await assert.rejects(resolveSchoolPage({evaluate:async()=>value},'fixture'),{code});
});
test('missing identifier times out explicitly instead of guessing',async()=>{
  let clock=0;
  await assert.rejects(resolveSchoolPage({evaluate:async()=>snapshot('urn:li:organization:123')},'fixture',{timeoutMs:500,now:()=>clock,wait:async ms=>{clock+=ms;}}),{code:'school_id_unconfirmed'});
});
