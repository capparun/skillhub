import {mkdir,lstat,readFile,chmod,writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {queryFingerprint} from './pagination.mjs';
import {matchesFilters} from './query.mjs';
import {normalizeFilters,queryFilters} from './fields.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function prepareEvidenceDirectory(path){
  if(typeof path!=='string'||!isAbsolute(path))fail('invalid_input');
  try{await mkdir(path,{mode:0o700});}catch(error){if(error.code==='EEXIST')fail('evidence_exists');throw error;}
  const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.mode&0o077)fail('invalid_input');
  return path;
}
// Capture on the still-owned search page, before cleanup. A screenshot of an API
// workspace is not evidence of API result rows, so reject that combination.
export async function captureSearchEvidence(result,input,transport,context,directory){
  try{
    if(result.collection_provider==='salesnav_read_api'||result.interruption||!result.query_fingerprint)fail('unsupported_evidence');
    const normalize=s=>typeof s==='string'?s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase():null;
    function verify(frame){
      const url=new URL(frame.url),type=url.pathname==='/sales/search/company'?'account':url.pathname==='/sales/search/people'?'lead':null;
      if(!type||url.origin!=='https://www.linkedin.com'||frame.blocking_dialog||!frame.ready||frame.visibility!=='visible')fail('evidence_not_ready');
      if(normalize(frame.identity)!==normalize(input.expected_identity))fail('identity_mismatch');
      const requested=result.requested_filters;
      if(!matchesFilters(url.searchParams.get('query'),{keywords:requested.keywords,filters:queryFilters(normalizeFilters(type,requested.filters))})||queryFingerprint(url.searchParams.get('query'),type,result.account_binding.profile_url)!==result.query_fingerprint)fail('query_mismatch');
      if(result.stop_reason==='verified_empty'&&(!frame.empty||frame.total_text!=='0 results'||frame.slots?.some(s=>s.href)))fail('evidence_mismatch');
      if(result.returned_count>0&&(frame.empty||!frame.slots?.some(s=>s.href&&s.name)))fail('evidence_mismatch');
      return {query:url.searchParams.get('query'),total_text:frame.total_text,ready:frame.ready,visibility:frame.visibility,empty:frame.empty??null};
    }
    const before=verify(await transport.readSearchFrame(context));
    const path=join(directory,'search-result.png');await transport.captureScreenshot(path,context);
    const png=await readFile(path);if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('invalid_screenshot');
    await chmod(path,0o600);
    const after=verify(await transport.readSearchFrame(context));
    if(before.query!==after.query||before.total_text!==after.total_text)fail('evidence_mismatch');
    const evidence={status:'captured',screenshot:path,observation:after,returned_count:result.returned_count,stop_reason:result.stop_reason};
    await writeFile(join(directory,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});return evidence;
  }catch(error){return {status:'failed',code:['unsupported_evidence','evidence_not_ready','identity_mismatch','query_mismatch','evidence_mismatch','invalid_screenshot','budget_exhausted','bridge_timeout','bridge_failure'].includes(error.code)?error.code:'evidence_capture_failed'};}
}
export async function captureFailureEvidence(transport,context,directory){
  try{
    const observation=await transport.readPageVisibility(context);
    const path=join(directory,'search-failure.png');await transport.captureScreenshot(path,context);
    const png=await readFile(path);if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('invalid_screenshot');
    await chmod(path,0o600);
    const after=await transport.readPageVisibility(context);
    const evidence={status:'failure_captured',screenshot:path,observation,after};
    await writeFile(join(directory,'failure-evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});return evidence;
  }catch{return {status:'failure_capture_failed'};}
}
