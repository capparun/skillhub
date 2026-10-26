import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {taskStatus,taskRecovery,taskExecute} from './task-store.mjs';
import {entityPresentation,reportColumns} from './presentation.mjs';
import {serializeExport} from '../export.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const valid=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
// Resume in the original ledger: budgets and account binding cannot reset.
export async function taskResume(input,options={}){
 const state=await taskStatus(input),recovery=await taskRecovery(input);
 if(recovery.status!=='ready_for_planning')fail('diagnosis_required');
 if(input.evidence_revision!==state.evidence_revision)fail('recovery_stale');
 if(!Array.isArray(input.person_keys)||!input.person_keys.length||new Set(input.person_keys).size!==input.person_keys.length)fail('person_selection_required');
 const people=input.person_keys.map(key=>{const p=recovery.pending.find(p=>p.key===key);if(!p)fail('person_not_pending');return p;});
 if(state.task.intent!=='people_discovery')fail('people_task_required');
 const account=JSON.parse(await readFile(join(input.directory,'account.json'),'utf8'));
 const request={provider:'salesnav',operation:'operations.batch',account,input:{operations:people.map(p=>({command:'lead-read',input:{lead:p.url,include_about:input.include_about??false}})),request_budget:input.request_budget??120}};
 return taskExecute({...input,request},options);
}
export async function consolidatedReport(input){
 if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>20||!valid(input.report_id))fail('invalid_sources');
 const states=[],entities=new Map();let criteria,intent,account;
 for(const source of input.sources){
  if(!valid(source.assessment_id))fail('invalid_assessment');
  const state=await taskStatus(source);
  const binding=JSON.parse(await readFile(join(source.directory,'account.json'),'utf8'));
  const a=JSON.parse(await readFile(join(source.directory,source.assessment_id+'.assessment.json'),'utf8'));
  if(a.task_fingerprint!==state.task_fingerprint||a.evidence_revision!==state.evidence_revision)fail('assessment_stale');
  const c=JSON.stringify(state.task.criteria),b=JSON.stringify(binding);
  if(criteria!==undefined&&(criteria!==c||intent!==state.task.intent||account!==b))fail('source_contract_mismatch');
  criteria=c;intent=state.task.intent;account=b;
  states.push({task_id:state.task.task_id,directory:source.directory,revision:state.revision,search_coverage:state.search_coverage,interruptions:state.operations.filter(o=>o.interruption||['blocked','unknown'].includes(o.status))});
  for(const e of state.entities){
   const stamp=e.observations.map(o=>o.observed_at??'').sort().at(-1)??'';
   const previous=entities.get(e.key),assessment=a.assessments.find(x=>x.key===e.key);
   if(previous&&previous.stamp===stamp&&JSON.stringify(previous.assessment)!==JSON.stringify(assessment))fail('assessment_conflict');
   if(!previous||stamp>previous.stamp)entities.set(e.key,{entity:e,assessment,stamp});
  }
 }
 const counts={candidates:entities.size,qualified:0,not_qualified:0,insufficient_evidence:0,not_evaluated:0};
 const labels={qualified:'符合',not_qualified:'不符合',insufficient_evidence:'证据不足',not_evaluated:'未评估'};
 const results=[...entities.values()].map(({entity:e,assessment:a})=>{const status=a?.status??'not_evaluated';counts[status]++;const row=entityPresentation(e,intent);return {...row,id:e.key,name:e.name,url:e.url,display:{...row.display,decision:labels[status],evidence:a?.reason??'尚未评估'}};});
 if(counts.candidates!==counts.qualified+counts.not_qualified+counts.insufficient_evidence+counts.not_evaluated)fail('count_mismatch');
 const provenance={sources:states,counts,assessment_complete:counts.not_evaluated===0,semantics:'consolidated_snapshot_not_a_new_platform_run'};
 const payload={results,presentation:{layout:'table',columns:reportColumns(intent),title:'LinkedIn 综合评估报告',summary:`候选 ${counts.candidates}；符合 ${counts.qualified}；不符合 ${counts.not_qualified}；证据不足 ${counts.insufficient_evidence}；未评估 ${counts.not_evaluated}。人员评估${provenance.assessment_complete?'全部完成':'未完成'}。`,evidence_scope:'复用已保存的平台回执；不代表公司全部人员或市场全量。历史操作中断保留在来源清单，不因汇总而抹除。',coverage:states.map(s=>`${s.task_id}：查询覆盖${s.search_coverage.complete?'完整':'未证实完整'}；历史异常${s.interruptions.length}`).join('；')}};
 const path=join(input.directory,input.report_id);
 await writeFile(path+'.html',serializeExport(payload,'html'),{flag:'wx',mode:0o600});
 const columns=reportColumns(intent);
 const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';
 await writeFile(path+'.csv','\ufeff'+[[...columns.map(c=>c.label),'来源'],...results.map(r=>[...columns.map(c=>r.display[c.key]??''),r.url])].map(r=>r.map(cell).join(',')).join('\r\n'),{flag:'wx',mode:0o600});
 await writeFile(path+'.sources.json',JSON.stringify(provenance,null,2),{flag:'wx',mode:0o600});
 return {...provenance,html:path+'.html',csv:path+'.csv'};
}
