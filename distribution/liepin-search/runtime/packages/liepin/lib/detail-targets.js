import crypto from 'node:crypto';

// This identifies a saved observation, not a person or a live DOM position.
export function listObservationTargets(task) {
 const targets=(task.unlinkedObservations ?? []).filter(o=>o.source==='liepin').map(o=>({...o,candidateKey:o.link?.candidateKey}));
 for(const candidate of task.candidates.filter(c=>c.source==='liepin')) {
  for(const observation of candidate.observations.filter(o=>o.stage==='list' && !o.identityLink)) {
   const id=crypto.createHash('sha256').update(JSON.stringify({candidateKey:candidate.key,roundId:observation.roundId,hash:observation.hash})).digest('hex');
   targets.push({...observation,id,source:'liepin',candidateKey:candidate.key});
  }
 }
 return targets;
}
export function detailTargets(task){
 return listObservationTargets(task).filter(o=>o.data?.detailTarget && o.data?.cardSelector && o.data?.summary).map(o=>({
  ...o,hasDetail:task.candidates.find(c=>c.key===o.candidateKey)?.observations.some(d=>d.stage==='detail' && ['partial','readable'].includes(d.data.status)) ?? false,
 }));
}
