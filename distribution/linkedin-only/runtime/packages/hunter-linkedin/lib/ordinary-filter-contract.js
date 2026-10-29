const fields=['keyword','location','connection','currentCompany','pastCompany','school','industry','language'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const tokens=value=>String(value??'').split(',').map(v=>v.trim());
export function validateOrdinaryFilters(input){
  for(const field of fields){
    const value=input[field];if(value===undefined||value==='')continue;
    if(typeof value!=='string'||value.length>1000||/[\u0000-\u001f\u007f]/.test(value))fail('invalid_filter_value');
    if(!value.trim())fail('invalid_filter_value');
  }
  if(!input.keyword?.trim())fail('keyword_required');
  for(const field of ['currentCompany','pastCompany','school']){
    if(input[field]&&tokens(input[field]).some(v=>!/^\d+$/.test(v)))fail('invalid_'+field+'_ids');
  }
  if(input.connection&&tokens(input.connection).some(v=>!['1st','2nd','3rd','3rd+','1度','2度','3度','3度+'].includes(v.toLowerCase())))fail('invalid_connection');
}
export function ordinaryFilterContract(input,{consumer,searchUrl,uiResolved=[]}={}){
  validateOrdinaryFilters(input);
  const url=new URL(searchUrl);
  const native={connection:'network',currentCompany:'currentCompany',pastCompany:'pastCompany',school:'schoolFilter',location:'geoUrn',industry:'industry',language:'profileLanguage'};
  const requested=Object.fromEntries(fields.filter(field=>input[field]).map(field=>[field,input[field]]));
  const applications=Object.entries(requested).map(([field,value])=>{
    if(field==='keyword')return {field,requested:value,method:'platform_keywords',encoded_value:url.searchParams.get('keywords'),exact_field_filter:false};
    if(consumer&&['location','industry','language'].includes(field))return {field,requested:value,method:'keyword_expansion',encoded_value:url.searchParams.get('keywords'),exact_field_filter:false};
    const key=native[field],encoded=url.searchParams.get(key);
    return {field,requested:value,method:encoded?'native_query_parameter':uiResolved.some(item=>item.startsWith(field+'='))?'ui_selection_requested':'not_confirmed',parameter:key,encoded_value:encoded,exact_field_filter:encoded?null:false,selection_state:'not_independently_observed'};
  });
  return {requested,applications,verification_scope:'encoded_query_preserved_across_pages; selection chips and per-person facts are separate evidence',exactness:'keyword expansion must not be interpreted as exact location, industry or language filtering'};
}
