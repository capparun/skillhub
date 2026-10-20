import {currentEvaluation} from './evaluation.js';
import {createHash} from 'node:crypto';
import {updateTask} from './task-store.js';

export function rankingFingerprint(task) {
 return createHash('sha256').update(JSON.stringify({criteria:task.requirements.criteria,
  candidates:task.candidates.map(c=>({key:c.key,evaluation:c.evaluations?.at(-1) ?? null,
   observations:c.observations.map(o=>o.hash)}))})).digest('hex');
}
export function currentRanking(task) {
 const last=task.rankings?.at(-1);
 return last && last.fingerprint===rankingFingerprint(task) && last.entries.every(entry=>{const candidate=task.candidates.find(c=>c.key===entry.candidateKey);return candidate&&currentEvaluation(task,candidate);})?last:null;
}
// Records a supplied human review order, never infers suitability or rejection.
export function recordRanking(file,input) {
 if(!input || typeof input.reviewer!=='string' || !input.reviewer.trim()
  || !Number.isFinite(Date.parse(input.reviewedAt)) || !Array.isArray(input.entries) || !input.entries.length)
  throw new Error('排序需要人工审阅者、时间和候选人顺序');
 return updateTask(file,task=>{
  const seen=new Set();
  const entries=input.entries.map(entry=>{
   const candidate=task.candidates.find(c=>c.key===entry.candidateKey);
   if(!candidate || seen.has(candidate.key))throw new Error('排序候选人不存在或重复');
   seen.add(candidate.key);
   const evaluation=currentEvaluation(task,candidate);
   if(!evaluation)throw new Error('排序前需要完成当前证据评估；旧评估已过期时须复评');
   if(typeof entry.reason!=='string' || !entry.reason.trim() || !Array.isArray(entry.criterionIds)
    || !entry.criterionIds.length || new Set(entry.criterionIds).size!==entry.criterionIds.length)
    throw new Error('每个人选需要职位条件依据和人工排序理由');
   for(const id of entry.criterionIds) {
    const finding=evaluation.findings.find(f=>f.criterionId===id);
    if(!finding || finding.status==='unknown' || !finding.evidence.length)
     throw new Error('排序依据必须引用已核实且有证据的职位条件');
   }
   return {candidateKey:candidate.key,reason:entry.reason.trim(),criterionIds:[...entry.criterionIds]};
  });
  task.rankings ??=[];
  task.rankings.push({reviewer:input.reviewer.trim(),reviewedAt:input.reviewedAt,entries,
   fingerprint:rankingFingerprint(task),purpose:'human-review-order'});
  task.events.push({type:'ranking_recorded',at:new Date().toISOString(),reviewer:input.reviewer.trim(),count:entries.length});
  return task;
 });
}
