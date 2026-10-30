import {compile} from './gateway.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Local preflight only. Never infer an entitlement from a product label or dispatch a fallback.
export function routeOptions(input, options={}) {
 if(!input || !Array.isArray(input.candidates)||!input.candidates.length||!Array.isArray(input.observations))fail('invalid_route_input');
 const now=options.now??Date.now();
 const rows=input.candidates.map(request=>{
  let reason=null;
  try{compile(request,options);}catch(e){reason=e.code??'invalid_request';}
  if(reason)return {provider:request?.provider,operation:request?.operation,status:'unsupported',reason};
  const observations=input.observations.filter(o=>o.provider===request.provider&&o.operation===request.operation&&o.profile===request.account.profile&&o.identity_url===request.account.expected_profile_url);
  const latest=observations.sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at))[0];
  if(!latest)return {provider:request.provider,operation:request.operation,status:'needs_check',reason:'operation_evidence_missing'};
  const start=Date.parse(latest.observed_at),end=Date.parse(latest.expires_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>now||end<=now||end<=start||typeof latest.source!=='string'||!latest.source.trim())return {provider:request.provider,operation:request.operation,status:'needs_check',reason:'invalid_or_expired_evidence'};
  const status=({available:'eligible',unavailable:'unavailable',unknown:'needs_check',blocked:'blocked'})[latest.status]??'needs_check';
  return {provider:request.provider,operation:request.operation,status,reason:latest.reason??null,source:latest.source};
 });
 const blocked=rows.some(r=>r.status==='blocked');
 return {schema_version:1,status:blocked?'blocked':'review_options',dispatched:false,automatic_fallback:false,options:rows,selection:'model_owned',warning:'Caller-supplied evidence is not fresh platform verification; execute retains identity and platform checks.'};
}
