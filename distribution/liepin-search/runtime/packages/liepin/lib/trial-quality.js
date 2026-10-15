import {roundCollectionIds} from './round-sources.js';
// Derived solely from saved evidence. No browser calls, writes, scoring or
// automatic approval: the review decision remains a separate task operation.
export function trialQuality(task) {
 const unresolvedOperations=(task.operations??[]).filter(op=>['started','unknown','blocked','failed'].includes(op.status)).length;
 const trials=(task.rounds??[]).filter(round=>round.phase==='trial'&&round.status!=='superseded');
 const rounds=trials.map(round=>{
  const sources=roundCollectionIds(round);
  const loose=(task.unlinkedObservations??[]).filter(observation=>sources.has(observation.roundId));
  const keys=new Set(loose.filter(observation=>observation.identityStatus==='linked'&&observation.link?.candidateKey)
   .map(observation=>observation.link.candidateKey));
  let directObservations=0;
  for(const candidate of task.candidates??[]){
   const direct=candidate.observations.filter(observation=>observation.stage==='list'&&sources.has(observation.roundId)&&!observation.identityLink);
   directObservations+=direct.length;
   if(direct.length)keys.add(candidate.key);
  }
  let readableDetails=0,partialDetails=0,unknownFindings=0;
  for(const candidate of (task.candidates??[]).filter(candidate=>keys.has(candidate.key))){
   const details=candidate.observations.filter(observation=>observation.stage==='detail');
   if(details.some(observation=>observation.data.status==='readable'))readableDetails++;
   else if(details.some(observation=>observation.data.status==='partial'))partialDetails++;
   const findings=candidate.evaluations?.at(-1)?.findings??[];
   unknownFindings+=(task.requirements.criteria??[]).filter(criterion=>{
    const finding=findings.find(finding=>finding.criterionId===criterion.id);
    return !finding||finding.status==='unknown';
   }).length;
  }
  const listObservations=loose.length+directObservations;
  const unresolvedIdentities=loose.filter(observation=>observation.identityStatus!=='linked').length;
  return {id:round.id,status:round.status,listObservations,identifiedCandidates:keys.size,
   unresolvedIdentities,
   readableDetails,partialDetails,missingDetails:Math.max(0,keys.size+unresolvedIdentities-readableDetails-partialDetails),unknownFindings};
 });
 return {schemaVersion:1,readyForHumanReview:trials.length>0&&trials.every(round=>round.status==='completed')&&unresolvedOperations===0,
  decisionRequired:true,unresolvedOperations,rounds,
  notice:'仅汇总已保存样本；不代表平台全部结果，partial不等于完整简历，未知不等于不符合。继续/修订/停止需另行记录复核。'};
}
