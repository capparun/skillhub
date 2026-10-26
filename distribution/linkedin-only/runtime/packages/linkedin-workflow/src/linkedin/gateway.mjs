import { validatePolicy } from './task-policy.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { withProfileLock } from '../profile-lock.mjs';
const exec = promisify(execFile);
const sn = fileURLToPath(new URL('../cli.mjs', import.meta.url));
export const operations = {
  salesnav: {'account.inspect':'account-check','capabilities.list':'capabilities','filters.resolve':'filter-options','company.search':'account-search','person.search':'lead-search','search.next':'search-page','company.read':'account-read','person.read':'lead-read','operations.batch':'batch'},
  linkedin: {'account.inspect':['linkedin','whoami'],'person.search':['hunter-linkedin','scout'],'person.read':['linkedin','profile-read'],'company.read':['linkedin','company'],'person.experience':['linkedin','profile-experience'],'person.projects':['linkedin','profile-projects']},
};
const allowed = { 'account.inspect':[], 'person.search':['keyword','location','connection','currentCompany','pastCompany','school','industry','language','limit'], 'person.read':['profile_url'], 'company.read':['company'], 'person.experience':['profile_url'], 'person.projects':['profile_url'] };
function fail(code) { throw Object.assign(new Error(code),{code}); }
function object(x) { return x && typeof x === 'object' && !Array.isArray(x); }
export function validateTask(task) {
  if (!object(task) || typeof task.task_id !== 'string' || !task.task_id.trim() || !['company_discovery','people_discovery','entity_read','account_diagnose'].includes(task.intent)) fail('invalid_task');
  if (!Array.isArray(task.criteria) || task.criteria.some(c=>!object(c)||typeof c.description!=='string'||!['required','preferred'].includes(c.strength))) fail('invalid_criteria');
  if (!object(task.target) || !Number.isInteger(task.target.count) || task.target.count<1 || !['candidates','qualified'].includes(task.target.meaning)) fail('invalid_target');
  validatePolicy(task);
  return {schema_version:1,task, status:'defined',next_action:'model_proposes_platform_plan', qualification:'not_evaluated'};
}
export function compile(request, {linkedinEntry} = {}) {
  if (!object(request) || !operations[request.provider]?.[request.operation] || !object(request.input)) fail('unsupported_operation');
  const binding=request.account;
  if (object(binding) && Object.keys(binding).some(k=>!['profile','expected_identity','expected_profile_url'].includes(k))) fail('unsupported_account_field');
  if (!object(binding)|| !/^[\w-]{1,80}$/.test(binding.profile??'') || typeof binding.expected_identity!=='string'|| !binding.expected_identity.trim()) fail('account_required');
  if (!/^https:\/\/www\.linkedin\.com\/in\/[\w%-]+\/$/.test(binding.expected_profile_url??'')) fail('profile_url_required');
  if (request.provider==='salesnav') {
    if (Object.keys(request.input).some(k=>['profile','expected_identity','expected_profile_url'].includes(k))) fail('binding_override');
    return {executable:process.execPath,args:[sn,operations.salesnav[request.operation],JSON.stringify({...request.input,...binding})],provider:'salesnav'};
  }
  if (!linkedinEntry || !isAbsolute(linkedinEntry)) fail('linkedin_runtime_required');
  const args=[linkedinEntry,'--profile',binding.profile,...operations.linkedin[request.operation]];
  for (const [k,v] of Object.entries(request.input)) {
    if (!allowed[request.operation].includes(k) || !['string','number'].includes(typeof v)) fail('unsupported_parameter');
    if (k==='limit' && (!Number.isInteger(v)||v<1||v>100)) fail('invalid_limit');
    if (k==='profile_url' && !/^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+\/?$/.test(v)) fail('invalid_profile_url');
    if(k==='company'){if(!/^(?:[\w-]+|https:\/\/www\.linkedin\.com\/company\/[\w%-]+\/?)$/.test(v))fail('invalid_company');args.push(String(v));}
    else args.push('--'+(k==='profile_url'?'profile-url':k),String(v));
  }
  if (request.operation==='person.search'&&!request.input.keyword?.trim()) fail('keyword_required');
  if (['person.read','person.experience','person.projects'].includes(request.operation)&&!request.input.profile_url) fail('profile_url_required');
  if(request.operation==='company.read'&&!request.input.company)fail('company_required');
  args.push('-f','json','--site-session','persistent');
  return {executable:process.execPath,args,provider:'linkedin'};
}
export async function runProcess(plan, {timeoutMs=300000}={}) {
  try { const r=await exec(plan.executable,plan.args,{timeout:Math.min(300000,timeoutMs),maxBuffer:16*1024*1024});return JSON.parse(r.stdout); }
  catch(e) { if(e.stdout){try{const body=JSON.parse(e.stdout);if(body?.ok===false)return body;}catch{ /* Do not expose stderr. */ }} fail(e.killed?'execution_outcome_unknown':'runtime_failure'); }
}
export function normalize(request, raw) {
  if (!object(raw)||typeof raw.ok!=='boolean') fail('invalid_response');
  let d=raw.data;
  if(raw.ok && request.provider==='linkedin' && d?.success===false){
    const upstream=typeof d.error==='string'&&/^[a-z_]+$/.test(d.error)?d.error:'upstream_failure';
    return {schema_version:1,provider:request.provider,operation:request.operation,status:'blocked',qualification:'not_evaluated',data:d,error:{code:upstream},coverage:{total_text:null,returned_count:null,completeness:'unknown',stop_reason:upstream},resume:null};
  }
  if(raw.ok && request.provider==='linkedin' && ['person.experience','person.projects','company.read'].includes(request.operation)){
    const rows=Array.isArray(d)?d:Array.isArray(d?.results)?d.results:null;
    if(!rows || rows.some(r=>!object(r)))fail('unsupported_result_shape');
    if(request.operation==='company.read'){
      if(rows.some(r=>/\/company\/(unavailable|not-found)(?:[/?#]|$)/.test(r.url??'')))fail('company_unavailable');
      if(rows.some(r=>!/^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+(?:\/(?:about|home))?\/?$/.test(r.url??'')))fail('company_identity_missing');
      d={results:rows,returned_count:rows.length,completeness:'defined_sections_only',raw_response:d};
    }else{
      // Section rows describe one person, not one candidate per experience/project.
      const canonical=u=>u.replace('://linkedin.com','://www.linkedin.com').replace(/\/$/,'');
      if(rows.some(r=>typeof r.profile_url!=='string'||canonical(r.profile_url)!==canonical(request.input.profile_url)))fail('profile_identity_mismatch');
      const section=request.operation.split('.')[1];
      d={results:rows.length?[{url:request.input.profile_url,[section]:rows,raw:rows}]:[],returned_count:rows.length?1:0,section_count:rows.length,completeness:'defined_sections_only',raw_response:d};
    }
  }
  if(raw.ok && request.provider==='linkedin' && ['person.read','person.search'].includes(request.operation)){
    const rows=Array.isArray(d)?d:Array.isArray(d?.results)?d.results:request.operation==='person.search'&&Array.isArray(d?.candidates)?d.candidates:null;
    if(!rows)fail('unsupported_result_shape');
    const results=rows.map(row=>{
      const original=row.profile_url??row.profileUrl??row.url;
      let url=original;
      try{const parsed=new URL(original);if(/^(www\.)?linkedin\.com$/.test(parsed.hostname)&&/^\/in\/[^/]+\/?$/.test(parsed.pathname)){parsed.search='';parsed.hash='';url=parsed.toString();}}catch{/* Preserve original evidence; do not invent URLs. */}
      return {...row,id:row.id??row.profileId,url,name:row.name??row.fullName??'',raw:row};
    });
    const missing=request.operation==='person.read'&&rows.some(r=>!r.about&&!r.experience);
    d={...(object(d)?d:{}),results,returned_count:d?.returned_count??results.length,completeness:missing?'partial':d?.completeness??(request.operation==='person.search'?'partial':'defined_sections_only'),raw_response:raw.data};
  }
  if (raw.ok && (!object(d) && !Array.isArray(d))) fail('invalid_response');
  const identityBlocked = request.provider === 'salesnav' && request.operation === 'account.inspect' &&
    (d?.identity_match !== true || d?.account_binding?.status !== 'observed');
  const incomplete = d?.interruption || d?.completeness === 'partial' || d?.truncated === true || Boolean(d?.cursor);
  const status = !raw.ok || identityBlocked ? 'blocked' : incomplete ? 'partial' : 'completed';
  return {schema_version:1,provider:request.provider,operation:request.operation,status,qualification:'not_evaluated',data:d??null,error:raw.error??(identityBlocked?{code:'identity_unconfirmed'}:null),coverage:{total_text:d?.pagination?.total_text??null,returned_count:d?.returned_count??null,completeness:d?.completeness??'unknown',stop_reason:d?.stop_reason??null},resume:d?.cursor?{provider:request.provider,account:request.account,operation:'search.next',input:{cursor:d.cursor}}:null};
}
export async function execute(request, options={}) {
  const plan=compile(request,options),deadline=Date.now()+(options.timeoutMs??300000);
  const runner=options.run??runProcess;
  const run=p=>{const remaining=deadline-Date.now();if(remaining<=0)fail('execution_outcome_unknown');return runner(p,{timeoutMs:remaining});};
  const work=async()=>{
    if(request.provider==='linkedin') {
      const identity=await run(compile({...request,operation:'account.inspect',input:{}},options));
      const rows=identity.data;const who=Array.isArray(rows)?rows.length===1?rows[0]:null:rows;
      const slug=request.account.expected_profile_url.split('/').filter(Boolean).at(-1);
      if(identity.ok!==true||who?.logged_in!==true||who?.name!==request.account.expected_identity||who?.public_id!==slug) fail('identity_unconfirmed');
      if(request.operation==='account.inspect')return normalize(request,identity);
    }
    return normalize(request,await run(plan));
  };
  // SalesNav owns the same lock inside its CLI; nesting would deadlock.
  // Ordinary LinkedIn acquires it here, protecting both provider paths.
  return request.provider==='linkedin'?withProfileLock(request.account.profile,work):work();
}
