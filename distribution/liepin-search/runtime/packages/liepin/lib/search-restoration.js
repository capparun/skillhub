import {requestFingerprint} from './operation-gate.js';
import {requirementsFingerprint} from './requirements.js';

export function restorationRequest(task,roundId,page,operationId) {
 if(typeof page!=='string'||!(/^[A-Fa-f0-9]{16,128}$/.test(page)||/^[1-9]\d*$/.test(page)&&Number.isSafeInteger(Number(page))))throw new Error('恢复需要当前已观察到的搜索目标');
 const round=task.rounds?.find(r=>r.id===roundId),original=task.operations?.find(o=>o.operationId===round?.operationId);
 if(!round || round.status!=='completed' || original?.kind!=='search' || original.status!=='completed'
  || original.fingerprint!==requestFingerprint({kind:'search',payload:round.filters}))throw new Error('仅恢复已完成且条件未变的原搜索');
 if(round.requirementsFingerprint && round.requirementsFingerprint!==requirementsFingerprint(task.requirements))throw new Error('需求已变化，不能恢复旧搜索');
 const cached=operationId?task.operations.find(o=>o.operationId===operationId&&o.kind==='restore-search'):null;
 const recoveryOf=cached?.evidence?.recoveryOf??round.restorations?.filter(r=>r.status==='completed').at(-1)?.operationId??original.operationId;
 const prior=task.operations.find(o=>o.operationId===recoveryOf);
 if(prior?.status!=='completed' || !Number.isFinite(Date.parse(prior.finishedAt))
  || (prior!==original && (prior.kind!=='restore-search' || prior.evidence?.roundId!==roundId)))throw new Error('上次搜索或恢复尚未核对');
 return {kind:'restore-search',payload:{roundId,page,filters:structuredClone(round.filters),recoveryOf}};
}

export function isEmptyRecoveryScene({controls,selected,results},previousFinishedAt) {
 const states=[controls,selected,results],after=Date.parse(previousFinishedAt);
 return Number.isFinite(after) && states.every(s=>{
  if(!s || s.readyState!=='complete' || s.blank || s.loading || s.login || s.risk || s.blocked
   || s.searchUi!==true)return false;
  try{const u=new URL(s.url);return u.origin==='https://h.liepin.com'&&u.pathname==='/search/getConditionItem';}catch{return false;}
 }) && states.every(s=>s.url===controls.url)
  && Array.isArray(controls.nonemptyInputs) && controls.nonemptyInputs.length===0
  && Array.isArray(selected.selected) && selected.selected.length===0
  && results.count===0 && Array.isArray(results.rows) && results.rows.length===0;
}
