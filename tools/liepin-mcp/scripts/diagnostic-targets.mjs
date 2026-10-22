import {detailTargets} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-targets.js';
/** Bound a read-only acceptance queue by reads, never by favorite writes. */
export function diagnosticTargets(items,{remaining,done=new Set()}={}){
 if(!Number.isSafeInteger(remaining)||remaining<0)throw Error('Invalid remaining detail count');
 const seen=new Set(done),result=[];
 for(const item of items){
  if(result.length>=remaining)break;
  if(typeof item?.resumeId!=='string'||!item.resumeId||seen.has(item.resumeId))continue;
  seen.add(item.resumeId);result.push(item);
 }
 return result;
}

export function observedDiagnosticTargets(task,currentPage){
 return detailTargets(task).filter(o=>Number(o.data?.page)===currentPage).map(o=>({
  id:o.id,hash:o.hash,resumeId:o.candidateKey?.startsWith('liepin:')?o.candidateKey.slice(7):null,
  page:currentPage,summary:o.data.summary,
 }));
}
