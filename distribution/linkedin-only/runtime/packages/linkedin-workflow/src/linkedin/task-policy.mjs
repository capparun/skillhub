const fail=code=>{throw Object.assign(new Error(code),{code});};
export function validatePolicy(task){
 if(task.coverage!==undefined && (!task.coverage || !['target_only','all_observed_queries'].includes(task.coverage.mode) || Object.keys(task.coverage).some(k=>!['mode','min_unique_people'].includes(k))))fail('invalid_coverage');
 if(task.coverage?.min_unique_people!==undefined && (task.intent!=='people_discovery'||!Number.isInteger(task.coverage.min_unique_people)||task.coverage.min_unique_people<1))fail('invalid_coverage');
 if(task.budgets!==undefined){
  if(!task.budgets || typeof task.budgets!=='object' || Array.isArray(task.budgets))fail('invalid_budget');
  for(const [k,v] of Object.entries(task.budgets))if(!['max_operations','max_pages','max_detail_reads','max_elapsed_seconds'].includes(k)||!Number.isInteger(v)||v<1)fail('invalid_budget');
 }
}
// Reservations are conservative: failed/unknown dispatches still consume their
// declared allowance. Replay consumes nothing; batch steps count individually.
export function reservation(request){
 const steps=request.operation==='operations.batch'?request.input.operations.map(s=>({operation:({'account-search':'company.search','lead-search':'person.search','account-read':'company.read','lead-read':'person.read'})[s.command],input:s.input})): [request];
 return steps.reduce((n,s)=>({pages:n.pages+(['company.search','person.search','search.next'].includes(s.operation)?s.input.max_pages??1:0),details:n.details+(['company.read','person.read','person.experience','person.projects'].includes(s.operation)?1:0)}),{pages:0,details:0});
}
export function checkBudget(record,operations,request,now=Date.now()){
 const b=record.task.budgets??{};const elapsed=(now-Date.parse(record.created_at))/1000;
 if(b.max_elapsed_seconds!==undefined&&elapsed>=b.max_elapsed_seconds)fail('task_time_budget_exhausted');
 const used=operations.reduce((n,o)=>{const r=reservation(o.request);return {pages:n.pages+r.pages,details:n.details+r.details};},{pages:0,details:0});
 const next=reservation(request);
 if(b.max_pages!==undefined && request.provider!=='salesnav'&&next.pages&&!(request.provider==='linkedin'&&['person.search','search.next'].includes(request.operation)&&Number.isInteger(request.input.max_pages)&&request.input.max_pages>0))fail('page_budget_unsupported');
 if(b.max_pages!==undefined&&used.pages+next.pages>b.max_pages)fail('task_page_budget_exhausted');
 if(b.max_detail_reads!==undefined&&used.details+next.details>b.max_detail_reads)fail('task_detail_budget_exhausted');
 return {remaining_ms:b.max_elapsed_seconds===undefined?undefined:Math.max(1,Math.floor(b.max_elapsed_seconds*1000-(now-Date.parse(record.created_at))))};
}
export function summarizeCoverage(receipts){
 const queries=new Map();let untracked=false;
 for(const receipt of receipts){
  const groups=receipt.data?.receipts?.map(r=>r.data)??[receipt.data];
  for(const d of groups){
   if(!d || !['account-search','lead-search','search-page','ordinary-people-search'].includes(d.operation))continue;
   if(!d.query_fingerprint){untracked=true;continue;}
   queries.set(d.query_fingerprint,{query_fingerprint:d.query_fingerprint,complete:d.completeness==='complete'&&!d.cursor&&!d.truncated,total_text:d.pagination?.total_text??null,returned_count:d.returned_count??0});
  }
  if(receipt.provider==='linkedin'&&['person.search','search.next'].includes(receipt.operation)&&receipt.data?.operation!=='ordinary-people-search')untracked=true;
 }
 return {complete:!untracked&&queries.size>0&&[...queries.values()].every(q=>q.complete),queries:[...queries.values()],untracked};
}
