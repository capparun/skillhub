import {entityPresentation,reportColumns} from './presentation.mjs';
import {checkBudget,summarizeCoverage} from './task-policy.mjs';
import {mkdir,readFile,writeFile,open,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateTask,compile,execute} from './gateway.mjs';
import {serializeExport} from '../export.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id=x=>{if(typeof x!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(x))fail('invalid_id');return x;};
const load=async p=>JSON.parse(await readFile(p,'utf8'));
async function lock(dir,work){const p=join(dir,'.task.lock');let h;try{h=await open(p,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('task_busy');throw e;}try{return await work();}finally{await h.close();await unlink(p);}}
async function save(p,x){await writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function createTask(input){
 const {task}=validateTask(input.task);id(task.task_id);
 const dir=resolve(input.directory);await mkdir(dir,{recursive:true,mode:0o700});
 await save(join(dir,'task.json'),{schema_version:1,task,fingerprint:hash(task),created_at:new Date().toISOString()});
 return {directory:dir,task_id:task.task_id,status:'created'};
}
async function taskAt(input){const dir=resolve(input.directory),record=await load(join(dir,'task.json'));if(record.task.task_id!==input.task_id)fail('task_mismatch');return {dir,record};}
export async function taskExecute(input,options={}){
 const {dir,record}=await taskAt(input);const operationId=id(input.operation_id);
 compile(input.request,options);

 const expected=record.task.intent==='company_discovery'?'company':record.task.intent==='people_discovery'?'person':null;
 if(expected && /^(company|person)\.(search|read|experience|projects)$/.test(input.request.operation)&&!input.request.operation.startsWith(expected+'.'))fail('task_operation_mismatch');
 if(expected && input.request.operation==='operations.batch'){
  const permitted=expected==='company'?['account-search','account-read']:['lead-search','lead-read'];
  if(!Array.isArray(input.request.input.operations)||input.request.input.operations.some(o=>!permitted.includes(o.command)))fail('task_operation_mismatch');
 }
 return lock(dir,async()=>{
  const prefix=join(dir,operationId),fingerprint=hash(input.request);
  const bindingPath=join(dir,'account.json');
  try{const binding=await load(bindingPath);if(hash(binding)!==hash(input.request.account))fail('task_account_mismatch');}
  catch(e){if(e.code!=='ENOENT')throw e;await save(bindingPath,input.request.account);}
  try{const prior=await load(prefix+'.planned.json');if(prior.fingerprint!==fingerprint)fail('operation_id_conflict');
   try{return {...await load(prefix+'.result.json'),replayed:true};}catch(e){if(e.code!=='ENOENT')throw e;fail('operation_outcome_unknown');}
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const current=await taskStatus(input);
  const max=record.task.budgets?.max_operations;
  if(max!==undefined && (!Number.isInteger(max)||max<1))fail('invalid_budget');
  if(max!==undefined && current.operations.length>=max)fail('task_budget_exhausted');
  const budget=checkBudget(record,current.operations,input.request);
  // Derive a runtime hint from the newest persisted SalesNav receipt. The adapter
  // still validates account, connection generation, expiry and fresh identity.
  // Never scan past a newer failed/unknown operation to resurrect stale access.
  let effectiveRequest=input.request;
  if(input.request.provider==='salesnav' && input.request.operation!=='account.inspect' && input.request.input?.execution_context===undefined){
   const prior=[];
   for(const op of current.operations.filter(o=>o.request.provider==='salesnav')){
    const plan=await load(join(dir,op.operation_id+'.planned.json'));
    prior.push({op,time:plan.time});
   }
   prior.sort((a,b)=>b.time.localeCompare(a.time));
   const latest=prior.length>1 && prior[0].time===prior[1].time ? null : prior[0]?.op;
   if(latest && ['completed','partial'].includes(latest.status)){
    const receipt=await load(join(dir,latest.operation_id+'.result.json'));
    const context=receipt.data?.execution_context;
    if(typeof context?.id==='string' && Number.isFinite(context.expires_at) && context.expires_at>Date.now()+5000){
     effectiveRequest={...input.request,input:{...input.request.input,execution_context:context.id}};
    }
   }
  }
  await save(prefix+'.planned.json',{task_fingerprint:record.fingerprint,fingerprint,request:input.request,effective_request:effectiveRequest,status:'dispatched',time:new Date().toISOString()});
  let result;try{result=await (options.execute??execute)(effectiveRequest,{...options,timeoutMs:budget.remaining_ms});}catch(e){result={status:'blocked',error:{code:e.code??'execution_outcome_unknown'},qualification:'not_evaluated'};}
  await save(prefix+'.result.json',result);return result;
 });
}
export async function taskStatus(input){
 const {dir,record}=await taskAt(input);const {readdir}=await import('node:fs/promises');const names=await readdir(dir);const operations=[];const entities=new Map();const receipts=[];
 for(const file of names.filter(n=>n.endsWith('.planned.json')).sort()){
  const operation_id=file.slice(0,-13),planned=await load(join(dir,file));let receipt;
  try{receipt=await load(join(dir,operation_id+'.result.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(receipt)receipts.push({time:planned.time,receipt});
  operations.push({operation_id,request:planned.request,status:receipt?.status??'unknown',coverage:receipt?.coverage??null,resume:receipt?.resume??null,error:receipt?.error??null,interruption:receipt?.data?.interruption??null});
  const data=receipt?.data;const groups=data?.receipts?data.receipts.map(r=>r.data):[data];
  for(const group of groups){for(const row of group?.results??[]){
   // Exact public URL can join providers; opaque IDs remain provider-scoped.
   const url=row.url??row.profileUrl;const publicUrl=typeof url==='string'&&/^https:\/\/(www\.)?linkedin\.com\/(in|company)\/[^/?#]+\/?$/.test(url)?url.replace('://linkedin.com','://www.linkedin.com').replace(/\/$/,''):null;
   const key=publicUrl??(row.id?planned.request.provider+':'+row.id:null);if(!key)continue;
   const current=entities.get(key)??{key,name:row.name??'',url:url??'',observations:[]};if(row.name)current.name=row.name;current.observations.push({operation_id,provider:planned.request.provider,observed_at:row.observed_at??group.checked_at??planned.time,row});entities.set(key,current);
  }}
 }
 const resolutions=[];
 for(const file of names.filter(n=>n.endsWith('.resolution.json'))) resolutions.push(await load(join(dir,file)));
 for(const op of operations)op.resolved_by=resolutions.find(r=>r.operation_id===op.operation_id)?.replacement_id??null;
 const evidence_revision=hash(await Promise.all(names.filter(n=>/\.(planned|result|resolution)\.json$/.test(n)).sort().map(async n=>[n,await load(join(dir,n))])));
 const revision=hash(await Promise.all(names.filter(n=>/\.(planned|result|assessment|resolution)\.json$/.test(n)).sort().map(async n=>[n,await load(join(dir,n))])));
 let delivery=null;try{delivery=await load(join(dir,'delivery.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 return {evidence_revision,search_coverage:summarizeCoverage(receipts.sort((a,b)=>a.time.localeCompare(b.time)).map(r=>r.receipt)),task:record.task,task_fingerprint:record.fingerprint,operations,entities:[...entities.values()],unique_count:entities.size,revision,status:delivery?.revision===revision?delivery.status:'in_progress',latest_delivery:delivery};
}
export async function taskAssess(input){
 const {dir,record}=await taskAt(input);return lock(dir,async()=>{
 const state=await taskStatus(input);const keys=new Set(state.entities.map(e=>e.key));
 if(!Array.isArray(input.assessments))fail('invalid_assessments');
 const seen=new Set();for(const a of input.assessments){
  if(!keys.has(a.key)||seen.has(a.key)||!['qualified','not_qualified','insufficient_evidence'].includes(a.status))fail('invalid_assessment');seen.add(a.key);
  if(typeof a.reason!=='string'||!a.reason.trim())fail('reason_required');
  if(a.status==='qualified'){
   const required=record.task.criteria.map((c,i)=>c.strength==='required'?i:null).filter(i=>i!==null);
   const observedOperations=new Set(state.entities.find(e=>e.key===a.key).observations.map(o=>o.operation_id));
   if(!Array.isArray(a.evidence)||required.some(i=>!a.evidence.some(e=>e.criterion_index===i&&observedOperations.has(e.operation_id)&&typeof e.source==='string'&&e.source.trim()&&typeof e.explanation==='string'&&e.explanation.trim())))fail('required_evidence_missing');
  }
 }
 const version=id(input.assessment_id);await save(join(dir,version+'.assessment.json'),{task_fingerprint:record.fingerprint,evidence_revision:state.evidence_revision,assessments:input.assessments});return {assessment_id:version,count:input.assessments.length,status:'recorded',semantics:'model_judgment_not_platform_fact'};
 });
}
const cell=x=>'"'+(/^[\s]*[=+@-]/.test(String(x))?"'":'')+String(x).replaceAll('"','""')+'"';
export async function taskReport(input){
 const {dir,record}=await taskAt(input);return lock(dir,async()=>{
 const state=await taskStatus(input),assessment=await load(join(dir,id(input.assessment_id)+'.assessment.json'));
 if(assessment.task_fingerprint!==record.fingerprint)fail('assessment_task_mismatch');
 if(assessment.evidence_revision!==state.evidence_revision)fail('assessment_stale');
 const byKey=new Map(assessment.assessments.map(a=>[a.key,a]));const results=state.entities.map(e=>{const a=byKey.get(e.key);return {...entityPresentation(e,state.task.intent),id:e.key,name:e.name,url:e.url,assessment:a??{status:'not_evaluated'},presentation:{decision:!a?'未评估':a.status==='qualified'?'符合':a?.status==='not_qualified'?'不符合':'证据不足',evidence:a ? a.reason+(a.evidence?.length?'；依据：'+a.evidence.map(e=>e.explanation+'（'+e.source+'）').join('；'):'') : '尚未评估',gaps:a?.status==='qualified'?'':a?.reason??'尚未评估'}};});
 const order={qualified:0,insufficient_evidence:1,not_evaluated:2,not_qualified:3};
 results.sort((a,b)=>order[a.assessment.status]-order[b.assessment.status]);
 const columns=reportColumns(state.task.intent);
 for(const row of results)Object.assign(row.display,{decision:row.presentation.decision,evidence:row.presentation.evidence});
 const counts={candidates:results.length,qualified:results.filter(r=>r.assessment.status==='qualified').length,not_qualified:results.filter(r=>r.assessment.status==='not_qualified').length,insufficient_evidence:results.filter(r=>r.assessment.status==='insufficient_evidence').length,not_evaluated:results.filter(r=>r.assessment.status==='not_evaluated').length};
 const qualified=assessment.assessments.filter(a=>a.status==='qualified').length;const achieved=(state.task.target.meaning==='qualified'?qualified:state.unique_count)>=state.task.target.count;
 const unresolved=state.operations.some(o=>!o.resolved_by&&(o.interruption||['unknown','blocked'].includes(o.status)||(state.task.intent==='entity_read'&&o.status==='partial')));
 const coverageRequired=state.task.coverage?.mode==='all_observed_queries';
 const status=achieved&&!unresolved&&(!coverageRequired||state.search_coverage.complete)?'completed':'partial';const title=state.task.intent==='people_discovery'?'LinkedIn 人员结果':'LinkedIn 公司结果';
 const payload={results,presentation:{layout:'table',columns,title,summary:`目标 ${state.task.target.count}；候选 ${state.unique_count}；模型评估符合 ${qualified}；未评估 ${counts.not_evaluated}；证据不足 ${counts.insufficient_evidence}；不符合 ${counts.not_qualified}。人员评估${counts.not_evaluated?'未全部完成':'已全部完成'}；操作中断 ${state.operations.filter(o=>o.interruption).length} 次。任务状态：${status}。覆盖要求：${state.task.coverage?.mode??'target_only'}；已观察查询窗口${state.search_coverage.complete?'已读完':'未证实读完'}。`,evidence_scope:state.task.evidence_scope??'证据类型未声明；不能据此认定为真实平台验收。',coverage:state.operations.map(o=>`${o.operation_id}：${o.status}；命中 ${o.coverage?.total_text??'未知'}；已读 ${o.coverage?.returned_count??'未知'}；停止原因 ${o.coverage?.stop_reason??'未提供'}`).join('；')}};
 const stem=id(input.report_id);await writeFile(join(dir,stem+'.html'),serializeExport(payload,'html'),{flag:'wx',mode:0o600});
 await writeFile(join(dir,stem+'.csv'),'\uFEFF'+[[...columns.map(c=>c.label),'来源'],...results.map(r=>[...columns.map(c=>r.display[c.key]||'未提供'),r.url])].map(r=>r.map(cell).join(',')).join('\r\n'),{flag:'wx',mode:0o600});
 const delivery={status,counts,qualified_count:qualified,candidate_count:state.unique_count,html:join(dir,stem+'.html'),csv:join(dir,stem+'.csv'),coverage_complete:state.search_coverage.complete,coverage_scope:'observed_queries_only',revision:state.revision};
 const {rename}=await import('node:fs/promises');await writeFile(join(dir,'.delivery.tmp'),JSON.stringify(delivery),{mode:0o600});await rename(join(dir,'.delivery.tmp'),join(dir,'delivery.json'));
 return delivery;
 });
}

export async function importSourcing(input){
 if(input.confirmed!==true || !input.sourcing_request || typeof input.sourcing_request!=='object' || Array.isArray(input.sourcing_request))fail('confirmed_sourcing_required');
 if(input.task?.intent!=='people_discovery')fail('sourcing_intent_required');
 // Mapping criteria is a model decision; retain the full source without guessing its schema.
 return createTask({...input,task:{...input.task,source:{kind:'confirmed_sourcing_request',request:input.sourcing_request,mapping_note:input.mapping_note??'Explicit task criteria supplied by the model; original request retained.'}}});
}

export async function resolveOperation(input){
 const {dir}=await taskAt(input);return lock(dir,async()=>{
 const state=await taskStatus(input),original=state.operations.find(o=>o.operation_id===id(input.operation_id)),replacement=state.operations.find(o=>o.operation_id===id(input.replacement_id));
 if(!original||!replacement||original.operation_id===replacement.operation_id||replacement.status!=='completed')fail('invalid_resolution');
 // Only verified local failures can be superseded. No manual clearance of access restrictions or unknown dispatch.
 if(original.status!=='blocked'||!['invalid_option','unsupported_parameter','invalid_input'].includes(original.error?.code))fail('resolution_not_allowed');
 if(original.request.provider!==replacement.request.provider||original.request.operation!==replacement.request.operation||typeof input.reason!=='string'||!input.reason.trim())fail('resolution_evidence_required');
 const record={operation_id:original.operation_id,replacement_id:replacement.operation_id,reason:input.reason,semantics:'model_attested_local_replacement',recorded_at:new Date().toISOString()};
 await save(join(dir,id(input.operation_id)+'.resolution.json'),record);return record;
 });
}
export async function companyPeopleTask(input){
 const parent=await taskStatus(input.parent);
 if(parent.task.intent!=='company_discovery'||input.task?.intent!=='people_discovery')fail('invalid_handoff_type');
 if(!Array.isArray(input.company_keys)||!input.company_keys.length||new Set(input.company_keys).size!==input.company_keys.length)fail('company_selection_required');
 const companies=input.company_keys.map(key=>{const e=parent.entities.find(e=>e.key===key);if(!e)fail('company_not_in_parent');return {key:e.key,name:e.name,url:e.url,observations:e.observations};});
 return createTask({directory:input.directory,task:{...input.task,source:{kind:'company_people_handoff',parent_task_id:parent.task.task_id,parent_task_fingerprint:parent.task_fingerprint,parent_revision:parent.revision,companies},account_policy:'bind_on_first_operation'}});
}

// Local handoff only: this is not candidate approval or sending authorization.
export async function prepareOutreach(input){
 const {dir}=await taskAt(input);return lock(dir,async()=>{
 const state=await taskStatus(input);
 if(state.task.intent!=='people_discovery')fail('people_task_required');
 if(typeof input.purpose!=='string'||!input.purpose.trim())fail('purpose_required');
 if(!Array.isArray(input.person_keys)||!input.person_keys.length||new Set(input.person_keys).size!==input.person_keys.length)fail('person_keys_required');
 const assessment=await load(join(dir,id(input.assessment_id)+'.assessment.json'));
 if(assessment.task_fingerprint!==state.task_fingerprint)fail('assessment_task_mismatch');
 if(assessment.evidence_revision!==state.evidence_revision)fail('assessment_stale');
 const shortlist=input.person_keys.map(key=>{
  const entity=state.entities.find(e=>e.key===key),a=assessment.assessments.find(x=>x.key===key);
  if(!entity||!entity.name||!a||a.status!=='qualified')fail('qualified_person_required');
  if(!/^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?$/.test(entity.url))fail('public_profile_required');
  return {name:entity.name,profileUrl:entity.url,reason:a.reason,evidence:a.evidence,source_key:key};
 });
 const result={schema_version:1,status:'prepared_not_approved',executionAllowed:false,purpose:input.purpose,source:{task_id:state.task.task_id,revision:state.revision,evidence_revision:state.evidence_revision,assessment_id:input.assessment_id},finalShortlist:shortlist,next_skill:'cskh-outreach',required_before_collection:['confirmed JD/JBF for existing recruiting workflow','explicit outreach intent','per-person candidate approval'],required_before_send:['current relationship evidence','per-action content approval','existing outreach safety checks']};
 const path=join(dir,id(input.handoff_id)+'.outreach.json');await save(path,result);return {...result,path};
 });
}

// Translate one prepared person to the legacy collector's input shape without
// inventing candidateApproval or invoking the collector.
export async function outreachInput(input){
 const {dir}=await taskAt(input);return lock(dir,async()=>{
 const state=await taskStatus(input),handoff=await load(join(dir,id(input.handoff_id)+'.outreach.json'));
 if(handoff.source?.task_id!==state.task.task_id||handoff.source?.evidence_revision!==state.evidence_revision||handoff.source?.revision!==state.revision)fail('handoff_stale');
 if(!input.recruiting_context||input.recruiting_context.confirmed!==true||typeof input.recruiting_context.description!=='string'||!input.recruiting_context.description.trim()||typeof input.recruiting_context.source!=='string'||!input.recruiting_context.source.trim())fail('confirmed_recruiting_context_required');
 const person=handoff.finalShortlist.find(p=>p.source_key===input.person_key);
 if(!person)fail('person_not_in_handoff');
 return {schema_version:1,status:'awaiting_candidate_approval',executionAllowed:false,collector_input:{candidate:person,purpose:handoff.purpose,recruitingContext:input.recruiting_context},source:handoff.source,missing:['candidateApproval from current conversation'],next_action:'Follow cskh-outreach candidate approval before collecting private relationship data; revalidate source before use.'};
 });
}

// Local recovery inventory only: never dispatch or bypass an interrupted account.
export async function taskRecovery(input){
 const state=await taskStatus(input);
 const completed=state.entities.filter(e=>e.observations.some(o=>o.row.fields?.current_roles));
 const done=new Set(completed.map(e=>e.key));
 return {task_id:state.task.task_id,status:state.operations.some(o=>o.interruption||['blocked','unknown'].includes(o.status))?'diagnosis_required':'ready_for_planning',dispatched:false,completed:completed.map(e=>({key:e.key,name:e.name,url:e.url})),pending:state.entities.filter(e=>!done.has(e.key)).map(e=>({key:e.key,name:e.name,url:e.url})),interruptions:state.operations.filter(o=>o.interruption||['blocked','unknown'].includes(o.status)).map(o=>({operation_id:o.operation_id,error:o.error,interruption:o.interruption})),instruction:'Preserve completed details. Diagnose interruptions before planning a new bounded operation; no automatic retry.'};
}
