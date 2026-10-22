import {listObservationTargets} from './detail-targets.js';
import {updateTask} from './task-store.js';
import {currentEvaluation,evaluationFingerprint} from './evaluation.js';
import {createHash} from 'node:crypto';
const text=(v,label)=>{if(typeof v!=='string'||!v.trim()||v.length>4000)throw Error(`${label}不能为空且不能超过4000字`);return v.trim();};
const standard=task=>createHash('sha256').update(JSON.stringify(task.requirements.criteria??[])).digest('hex');
const closureFingerprint=task=>createHash('sha256').update(JSON.stringify({
 requirements:task.requirements,contracts:task.sourcing?.contracts,decisions:task.sourcing?.decisions,
 listReviews:task.sourcing?.listReviews,candidates:task.candidates,observations:task.unlinkedObservations,
 operations:task.operations,rounds:task.rounds,
})).digest('hex');
export function closeSourcing(file,input){
 if(!['complete','partial'].includes(input.status))throw Error('收口状态必须为complete或partial');
 const reviewer=text(input.reviewer,'核对人'),reason=text(input.reason,'停止原因'),coverage=text(input.coverage,'覆盖说明');
 return updateTask(file,task=>{
  const progress=sourcingProgress(task);
  if(!progress.contract)throw Error('先记录寻访契约');
  if(input.status==='complete'&&(input.coverageConfirmed!==true||progress.blockers.length))throw Error('覆盖未确认或仍有未完成项，只能记录部分完成');
  task.sourcing.closures??=[];
  task.sourcing.closures.push({status:input.status,reviewer,reason,coverage,coverageConfirmed:input.coverageConfirmed===true,at:new Date().toISOString(),evidenceFingerprint:closureFingerprint(task),blockers:progress.blockers});
  return task;
 });
}
export function configureSourcing(file,input){
 const confirmedBy=text(input.confirmedBy,'确认人'),authorization=text(input.authorization,'授权原文'),stopCondition=text(input.stopCondition,'停止条件');
 if(!Number.isFinite(Date.parse(input.confirmedAt)))throw Error('需要真实确认时间');
 if(!['favorites','research'].includes(input.goal))throw Error('目标须为favorites或research');
 const groups=input.groups??[];
 if(!Array.isArray(groups)||groups.length>20||groups.some(g=>typeof g!=='string'||!g.trim()||g.length>100)||new Set(groups).size!==groups.length)throw Error('分组列表无效');
 if(input.goal==='favorites'&&!groups.length)throw Error('收藏目标需要明确分组');
 return updateTask(file,task=>{
  if(!(task.requirements.criteria??[]).length)throw Error('先明确岗位标准');
  task.sourcing??={contracts:[],decisions:[],listReviews:[]};
  const revision=task.sourcing.contracts.length+1;
  task.sourcing.contracts.push({revision,standardHash:standard(task),goal:input.goal,groups,confirmedBy,confirmedAt:input.confirmedAt,authorization,stopCondition});
  task.events.push({type:'sourcing_contract_recorded',revision,at:new Date().toISOString()});return task;
 });
}
export function recordSourcingDecision(file,input){
 if(!['follow_up','clarify','not_pursued'].includes(input.decision))throw Error('处理结果无效');
 const reason=text(input.reason,'判断依据'),reviewer=text(input.reviewer,'审阅者');
 return updateTask(file,task=>{
  const contract=task.sourcing?.contracts.at(-1),candidate=task.candidates.find(c=>c.key===input.candidateKey);
  if(!contract||contract.standardHash!==standard(task))throw Error('标准未确认或已变化');
  if(!candidate)throw Error('候选人不存在');
  const evaluation=currentEvaluation(task,candidate);
  if(!evaluation)throw Error('先保存当前证据评估');
  if(evaluation.findings.some(f=>f.reason==='尚未核实'))throw Error('必须统一核对全部条件并记录具体缺口，不能沿用自动占位');
  const unresolved=evaluation.findings.filter(f=>f.status==='unknown'||(f.kind==='required'&&f.status==='contradicted')||(f.kind==='exclusion'&&f.status==='supported'));
  const conflicts=evaluation.findings.filter(f=>(f.kind==='required'&&f.status==='contradicted')||(f.kind==='exclusion'&&f.status==='supported'));
  if(input.decision==='follow_up'&&conflicts.length)throw Error('存在明确硬门槛或排除项冲突：先记录clarify或not_pursued；用户确认例外后更新标准、重新确认并评估，不能仅填写缺口后收藏');
  const gaps=input.gaps??[];
  if(!Array.isArray(gaps)||gaps.some(g=>typeof g!=='string'||!g.trim()))throw Error('缺口说明无效');
  if(unresolved.length&&!gaps.length)throw Error('必须说明未知或冲突项');
  const group=input.group??null;
  if(input.decision==='follow_up'&&contract.goal==='favorites'&&!contract.groups.includes(group))throw Error('必须选择已确认目标组');
  if(input.decision==='follow_up'&&!evaluation.findings.some(f=>f.status==='supported'&&f.kind!=='exclusion'))throw Error('缺少支持跟进的职位相关证据');
  task.sourcing.decisions.push({candidateKey:candidate.key,decision:input.decision,reason,gaps,group,reviewer,at:new Date().toISOString(),contractRevision:contract.revision,evidenceFingerprint:evaluationFingerprint(task,candidate)});
  task.events.push({type:'sourcing_decision_recorded',candidateKey:candidate.key,decision:input.decision,at:new Date().toISOString()});return task;
 });
}
export function recordListReview(file,input){
 const reason=text(input.reason,'列表处理理由');
 if(!['needs_detail','reuse_detail','skip_unrelated'].includes(input.disposition))throw Error('列表处理状态无效');
 return updateTask(file,task=>{
  const observation=listObservationTargets(task).find(o=>o.id===input.observationId);
  if(!observation)throw Error('列表观察不存在');
  task.sourcing??={contracts:[],decisions:[],listReviews:[]};
  task.sourcing.listReviews.push({observationId:observation.id,hash:observation.hash,disposition:input.disposition,reason,at:new Date().toISOString()});return task;
 });
}
export function sourcingProgress(task){
 const contract=task.sourcing?.contracts.at(-1),latest=new Map();
 for(const d of task.sourcing?.decisions??[])latest.set(d.candidateKey,d);
 const people=task.candidates.map(candidate=>{
  const decision=latest.get(candidate.key);
  const conflict=decision?.decision==='follow_up'&&currentEvaluation(task,candidate)?.findings.some(f=>(f.kind==='required'&&f.status==='contradicted')||(f.kind==='exclusion'&&f.status==='supported'));
  const stale=!!decision&&(conflict||!contract||decision.contractRevision!==contract.revision||contract.standardHash!==standard(task)||decision.evidenceFingerprint!==evaluationFingerprint(task,candidate));
  const operations=(task.operations??[]).filter(o=>o.kind==='favorite'&&o.payload?.resumeId===candidate.identity&&o.payload?.group===decision?.group);
  const operation=operations.at(-1),evidence=operation?.evidence;
  const journal=task.operations??[],lastMutation=journal.findLastIndex(o=>['favorite','unfavorite'].includes(o.kind)&&o.payload?.resumeId===candidate.identity);
  const membership=journal.findLast((o,index)=>index>lastMutation&&o.kind==='inspect'&&o.status==='completed'&&o.evidence?.verification==='favorites-list-readback'&&o.evidence.groupReadback===true&&o.evidence.selectedGroup===decision?.group&&o.evidence.rows?.some(row=>row.resumeId===candidate.identity&&['visible-detail-link','row-class'].includes(row.identityEvidence)));
  const mutation=journal[lastMutation];
  const favorite=['started','unknown'].includes(mutation?.status)?'unknown':membership?'confirmed':mutation?.kind==='unfavorite'?'not_confirmed':operation?.status==='completed'&&evidence?.saved?'saved_group_unverified':'not_confirmed';
  return {candidateKey:candidate.key,decision:stale?null:decision??null,decisionStale:stale,favorite,operationId:operation?.operationId??null,groupReadbackOperationId:membership?.operationId??null};
 });
 const blockers=[];
 if(!contract||contract.standardHash!==standard(task))blockers.push('岗位标准未确认或已变化');
 if((task.operations??[]).some(o=>['started','unknown','blocked','failed'].includes(o.status)))blockers.push('存在未核对操作');
 if(people.some(p=>!p.decision))blockers.push('存在未完成的有效评估');
 if(people.some(p=>p.decision?.decision==='clarify'))blockers.push('存在待校准人选');
 if(contract?.goal==='favorites'&&people.some(p=>p.decision?.decision==='follow_up'&&p.favorite!=='confirmed'))blockers.push('跟进人选目标分组尚未全部核实');
 const reviews=new Map((task.sourcing?.listReviews??[]).map(r=>[r.observationId,r]));
 if(listObservationTargets(task).filter(o=>o.data?.collection!=='favorites').some(o=>{
  const review=reviews.get(o.id);return !review||review.hash!==o.hash||(review.disposition!=='skip_unrelated'&&!task.candidates.find(c=>c.key===(o.candidateKey??o.link?.candidateKey))?.observations.some(d=>d.stage==='detail'&&['readable','partial'].includes(d.data.status)));
 }))blockers.push('列表存在未复核或未补齐详情的条目');
 const closure=task.sourcing?.closures?.at(-1),closureStale=!!closure&&closure.evidenceFingerprint!==closureFingerprint(task);
 return {contract:contract??null,contractStale:!!contract&&contract.standardHash!==standard(task),people,counts:{identified:people.length,reviewed:people.filter(p=>p.decision).length,followUp:people.filter(p=>p.decision?.decision==='follow_up').length,favoriteConfirmed:people.filter(p=>p.decision?.decision==='follow_up'&&p.favorite==='confirmed').length},blockers,closure:closureStale?null:closure??null,closureStale,complete:!!closure&&!closureStale&&closure.status==='complete'&&!blockers.length,note:'收口由核对人确认覆盖并绑定当前证据；不表示市场人才已找全，也不授予额外浏览器操作权限'};
}
