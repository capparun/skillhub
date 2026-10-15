import {updateTask} from './task-store.js';

// An explicit human confirmation joins an observed list card to a saved detail.
// Names and list positions are never treated as candidate identifiers.
export function linkListObservation(file,{observationId,candidateKey,detailHash,reviewedBy,reviewedAt,reason}) {
 if(![observationId,candidateKey,detailHash,reviewedBy,reason].every(v=>typeof v==='string' && v.trim()) || !Number.isFinite(Date.parse(reviewedAt)))throw new Error('关联需要列表记录、候选人、详情快照、复核人、时间与核对依据');
 return updateTask(file,task=>{
  const record=task.unlinkedObservations?.find(o=>o.id===observationId);
  const candidate=task.candidates.find(c=>c.key===candidateKey);
  if(!record || !candidate || record.source!==candidate.source)throw new Error('列表记录或同来源候选人不存在');
  const detail=candidate.observations.find(o=>o.hash===detailHash && o.stage==='detail' && ['readable','partial'].includes(o.data.status));
  if(!detail)throw new Error('必须关联已保存、可读取的详情快照');
  if(record.identityStatus==='linked') {
   if(record.link.candidateKey!==candidateKey || record.link.detailHash!==detailHash)throw new Error('该记录已经关联其他身份或证据，不能覆盖原关联');
   return task;
  }
  const link={observationId,candidateKey,detailHash,reviewedBy,reviewedAt,reason,method:'human-confirmed'};
  candidate.observations.push({stage:'list',roundId:record.roundId,capturedAt:record.capturedAt,hash:record.hash,data:structuredClone(record.data),identityLink:link});
  record.identityStatus='linked';record.link=link;
  task.events.push({type:'list_identity_linked',at:reviewedAt,...link});
  return task;
 });
}
