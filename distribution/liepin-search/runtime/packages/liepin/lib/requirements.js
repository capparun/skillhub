import {requestFingerprint} from './operation-gate.js';

// Source documents are inert task data, never executable instructions.
export function validateRequirementSources(plan) {
 if(plan.sources===undefined)return;
 if(!Array.isArray(plan.sources) || !plan.sources.length || plan.sources.length>20)throw new Error('需求来源应为1–20份 JD、Align 或用户补充');
 const documents=new Map();
 for(const source of plan.sources) {
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(source.id ?? '') || documents.has(source.id)
   || !['jd','align','user'].includes(source.kind) || typeof source.text!=='string' || !source.text.trim() || source.text.length>200000)throw new Error('需求来源需要唯一ID、类型和原文（每份不超过20万字）');
  documents.set(source.id,source);
 }
 for(const criterion of plan.criteria) {
  if(!Array.isArray(criterion.evidence) || !criterion.evidence.length)throw new Error(`条件 ${criterion.id} 缺少 JD/Align/用户确认原文依据`);
  for(const item of criterion.evidence) {
   const source=documents.get(item.sourceId);
   if(!source || typeof item.quote!=='string' || !item.quote.trim() || !source.text.includes(item.quote))throw new Error(`条件 ${criterion.id} 的引用不在所指原文中`);
  }
 }
 if(plan.openQuestions!==undefined && (!Array.isArray(plan.openQuestions) || plan.openQuestions.some(q=>typeof q!=='string' || !q.trim())))throw new Error('待确认事项必须为明确的问题列表');
 for(const round of plan.rounds) {
  if(round.criterionIds!==undefined && (!Array.isArray(round.criterionIds) || round.criterionIds.some(id=>!plan.criteria.some(c=>c.id===id))))throw new Error('搜索轮次引用了不存在的职位条件');
 }
}
export function requirementsFingerprint(requirements) {
 return requestFingerprint({kind:'requirements',payload:requirements});
}
export function requirementBrief(task) {
 const p=task.requirements;
 return {title:p.title,required:p.criteria.filter(c=>c.kind==='required'),bonus:p.criteria.filter(c=>c.kind==='bonus'),exclusion:p.criteria.filter(c=>c.kind==='exclusion'),
  rounds:task.rounds.map(r=>({id:r.id,phase:r.phase,filters:r.filters,criterionIds:r.criterionIds ?? [],status:r.status})),
  sources:(p.sources ?? []).map(s=>({id:s.id,kind:s.kind,title:s.title ?? s.id})),openQuestions:p.openQuestions ?? [],
  fingerprint:requirementsFingerprint(p)};
}
