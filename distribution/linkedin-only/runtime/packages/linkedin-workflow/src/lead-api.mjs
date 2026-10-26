// Same read-only endpoint and versioned decoration as installed OpenCLI 2.0.1
// linkedin/salesnav-search. Credentials stay inside the authenticated page.
export function leadApiScript(keywords, start = 0) {
  if (typeof keywords !== 'string' || !keywords.trim() || keywords.length > 1000 || !Number.isInteger(start) || start < 0 || start > 1975 || start % 25) throw Object.assign(new Error('invalid_input'), { code: 'invalid_input' });
  const query = '(spellCorrectionEnabled:true,recentSearchParam:(doLogHistory:true),keywords:' + encodeURIComponent(keywords) + ')';
  const url = 'https://www.linkedin.com/sales-api/salesApiLeadSearch?q=searchQuery&query=' + query + '&start=' + start + '&count=25&decorationId=com.linkedin.sales.deco.desktop.searchv2.LeadSearchResult-14';
  return `(async()=>{if(location.origin!=='https://www.linkedin.com')return {error:'unexpected_origin'};const raw=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('JSESSIONID='))?.slice(11);if(!raw)return {error:'login_required'};const csrf=raw.replace(/^"|"$/g,'');try{const r=await fetch(${JSON.stringify(url)},{credentials:'include',headers:{'csrf-token':csrf,'x-restli-protocol-version':'2.0.0',accept:'application/json'}});if(!r.ok)return {error:r.status===401?'login_required':r.status===403?'access_denied':r.status===429?'rate_limited':'api_read_failed',status:r.status};const x=await r.json();if(!Array.isArray(x.elements))return {error:'invalid_response'};return {status:r.status,paging:x.paging??null,elements:x.elements.map(e=>({entityUrn:e.entityUrn,name:e.fullName??[e.firstName,e.lastName].filter(Boolean).join(' '),currentPositions:(e.currentPositions??[]).map(p=>({title:p.title,companyName:p.companyName})),geoRegion:e.geoRegion,degree:e.degree}))};}catch{return {error:'api_read_failed'};}})()`;
}
const fail = code => { throw Object.assign(new Error(code), { code }); };
export async function keywordLeadRead(input, check, transport, context, { sleep = ms => new Promise(r=>setTimeout(r,ms)), previous, checkpointOptions } = {}) {
  if (check.identity_match !== true || check.account_binding?.status !== 'observed' || check.account_binding.profile_url !== input.expected_profile_url || check.salesnav_access?.status !== 'available') fail('account_unconfirmed');
  if (check.lead_search_access?.status === 'unavailable' || !['available','unknown'].includes(check.lead_search_access?.status) || check.lead_search_access.status === 'unknown' && !['page_not_ready','window_not_visible','target_validation_required'].includes(check.lead_search_access.reason)) fail('account_unconfirmed');
  await transport.open('https://www.linkedin.com/sales/search/people?viewAllFilters=true', context);
  const observations=[];
  async function verify() {
    for (let i=0;i<8;i++) {
      const f=await transport.readSearchFrame(context);
      let u;try{u=new URL(f.url);}catch{fail('page_changed');}
      if(u.origin!=='https://www.linkedin.com'||u.pathname!=='/sales/search/people')fail(/\/login/.test(u.pathname)?'login_required':/\/checkpoint/.test(u.pathname)?'verification_required':'page_changed');
      if(f.blocking_dialog)fail('page_blocked');
      if(f.identity && f.identity!==check.observed_identity)fail('identity_mismatch');
      if(f.identity===check.observed_identity){observations.push({visibility:f.visibility??'unknown',fields:f.fields?.length??null});return;}
      if(i<7)await sleep(350);
    }
    fail('account_unconfirmed');
  }
  const results = structuredClone(previous?.results ?? []), initialCount = results.length;
  const seen = new Set(results.map(r=>r.id));
  let start=previous?.api_start ?? 0, offset=previous?.api_offset ?? 0, pageIds=previous?.api_page_ids ?? null;
  let total=null, pages=0, completedPages=0, complete=false, stop='page_limit', interruption=null;
  try {
    while(pages < (input.max_pages ?? 1)) {
      await verify();
      const payload=await transport.readLeadSearchApi(input.keywords,start,context);
      await verify();
      const rows=parseLeadApi(payload,25), ids=rows.map(r=>r.id);
      if(payload.paging?.start!==start)fail('page_changed');
      if(pageIds && JSON.stringify(pageIds)!==JSON.stringify(ids))fail('page_changed');
      pageIds=ids;
      total=Number.isSafeInteger(payload.paging?.total)&&payload.paging.total>=0?payload.paging.total:null;
      pages++;
      for(;offset<rows.length && results.length<input.limit;offset++) {
        const row=rows[offset];if(!seen.has(row.id)){row.hits=[{page:Math.floor(start/25)+1,position:offset+1,observed_at:row.observed_at}];results.push(row);seen.add(row.id);}
      }
      if(offset<rows.length){stop='result_limit';break;}
      completedPages++;
      if(rows.length<25 || total!==null && start+payload.elements.length>=total || start>=1975) {
        complete=true;stop=results.length?'available_window_end':'verified_empty';break;
      }
      start+=25;offset=0;pageIds=null;
      if(results.length>=input.limit){stop='result_limit';break;}
    }
  } catch(e) {
    if(!results.length)throw e;
    stop=e.code??'api_read_failed';interruption={code:stop,stage:'collect_results',recovery:'resume_with_same_account_and_query'};
  }
  const {queryFingerprint}=await import('./pagination.mjs');
  const {saveCheckpoint}=await import('./checkpoints.mjs');
  const query='(spellCorrectionEnabled:true,keywords:'+encodeURIComponent(input.keywords)+')';
  const binding=check.account_binding.profile_url, fingerprint=queryFingerprint(query,'lead',binding);
  let cursor=null;
  if(!complete)cursor=await saveCheckpoint({operation:'lead-search',search_type:'lead',collection_provider:'salesnav_read_api',profile:input.profile,expected_identity:input.expected_identity,observed_identity:check.observed_identity,expected_profile_url:input.expected_profile_url,account_binding:check.account_binding,binding,query,query_fingerprint:fingerprint,keywords:input.keywords,filters:{},results,limit:input.limit,api_start:start,api_offset:offset,api_page_ids:pageIds},checkpointOptions);
  const all=complete&&total!==null&&total===results.length;
  return {operation:previous?'search-page':'lead-search',profile:input.profile,account_binding:check.account_binding,requested_filters:{keywords:input.keywords,filters:{}},applied_filters:{keywords:input.keywords,filters:{}},results,returned_count:results.length,new_count:results.length-initialCount,completeness:all?'complete':complete?'complete_available_window':'partial',truncated:!all,stop_reason:stop,result_scope:results.length?'authenticated_search_window':'verified_empty',collection_provider:'salesnav_read_api',capability_evidence:{source:'authenticated_api_response',ui_search_controls:check.lead_search_access?.reason,first_observation:observations[0]??null,last_observation:observations.at(-1)??null},pagination:{current_page:Math.floor(start/25)+1,resume_page:complete?null:Math.floor(start/25)+1,total,total_text:total===null?null:`${total} results`,complete_pages_this_call:completedPages,fetched_pages:pages,available_window_end:complete},query_fingerprint:fingerprint,cursor,resume_supported:!!cursor,...(interruption?{interruption}:{}),checked_at:new Date().toISOString()};
}
export function parseLeadApi(payload, limit) {
  if(payload?.error)fail(['login_required','access_denied','rate_limited','invalid_response'].includes(payload.error)?payload.error:'api_read_failed');
  if(payload?.status!==200||!Array.isArray(payload.elements)||payload.elements.length>25)fail('invalid_response');
  if(payload.elements.length===0 && payload.paging?.total!==0)fail('invalid_response');
  const results=[];
  for(const e of payload.elements){
    const m=typeof e?.entityUrn==='string'&&/^urn:li:fs_salesProfile:\(([^,()]+),([^,()]+),([^,()]+)\)$/.exec(e.entityUrn);
    if(!m||typeof e.name!=='string'||!e.name.trim()||!Array.isArray(e.currentPositions))fail('invalid_response');
    const url=`https://www.linkedin.com/sales/lead/${encodeURIComponent(m[1])},${encodeURIComponent(m[2])},${encodeURIComponent(m[3])}`;
    const values={current_roles:e.currentPositions.map(p=>({title:p.title??null,company:p.companyName??null})),location:e.geoRegion??null,degree:e.degree??null};
    results.push({id:m[1],name:e.name.trim(),url,fields:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:v,status:v===null?'unknown':'observed',source:url,section:'search_api'}])),observed_at:new Date().toISOString()});
  }
  return results.slice(0,limit);
}
