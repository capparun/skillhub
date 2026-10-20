import {roundCollectionIds} from './round-sources.js';
import {validateRequirementSources,requirementsFingerprint} from './requirements.js';
import { plan as validateFilters } from './filters.js';
import { createTask, readTask, updateTask, saveObservations, mergeListResults } from './task-store.js';
import { requestFingerprint,cumulativeBudgetLimit } from './operation-gate.js';
import { executeScopedOperation } from './site-scope.js';

const categories = ['skills','experience','qualification','responsibilities'];
export function validatePlan(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim()) throw new Error('缺少职位名称');
  if (!Array.isArray(input.criteria) || !input.criteria.length) throw new Error('至少需要一个职位相关评估条件');
  const ids=new Set();
  for (const criterion of input.criteria) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(criterion.id ?? '') || ids.has(criterion.id)) throw new Error('评估条件 ID 必须唯一');
    ids.add(criterion.id);
    if (!categories.includes(criterion.category)) throw new Error('仅支持职位技能、相关经验、资格和职责条件');
    if (typeof criterion.label !== 'string' || !criterion.label.trim() || !['required','bonus','exclusion'].includes(criterion.kind)) throw new Error('条件须包含描述和 required/bonus/exclusion 类型');
    if (!Number.isFinite(criterion.weight) || criterion.weight <= 0 || criterion.weight > 100) throw new Error('条件权重须大于 0 且不超过 100');
  }
  if (!Array.isArray(input.rounds) || !input.rounds.length || input.rounds.length > 10) throw new Error('需要 1–10 个明确搜索轮次');
  const roundIds=new Set();
  for (const round of input.rounds) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(round.id ?? '') || roundIds.has(round.id)) throw new Error('轮次 ID 必须唯一');
    roundIds.add(round.id);
    if (!['trial','full'].includes(round.phase)) throw new Error('轮次必须声明 trial/full');
    validateFilters(round.filters ?? {});
  }
  if (!input.rounds.some(r=>r.phase==='trial')) throw new Error('需要至少一个小批试搜轮次');
  validateRequirementSources(input);
  return structuredClone(input);
}
export function initializeWorkflow(file, input) {
  const requirements=validatePlan(input);
  createTask(file,requirements);
  return updateTask(file,task=>({...task,executionPreferences:{readingMode:'content-led-visible-review',detailIntervalMs:6000,detailConcurrency:1,source:'Skill default: visible content review; task may explicitly override within authorization'}}));
}
// A revision is a proposal, not execution permission. Keep completed rounds,
// their observations and existing operation budgets; approval is still separate.
export function proposeRevision(file,{rounds,reason,proposedBy,proposedAt}) {
  if(typeof reason!=='string' || !reason.trim() || typeof proposedBy!=='string' || !proposedBy.trim()
    || !Number.isFinite(Date.parse(proposedAt)))throw new Error('修订方案需要提出人、时间和调整原因');
  return updateTask(file,task=>{
    if(task.status==='paused' || task.operations?.some(op=>['started','unknown','blocked','failed'].includes(op.status)))throw new Error('先核对暂停或未确认操作，修订方案不能解除暂停');
    const review=task.reviews?.at(-1);
    if(review?.decision!=='revise' || review.trialFingerprint!==trialFingerprint(task))throw new Error('需要基于当前试搜证据明确选择 revise');
    const validated=validatePlan({...task.requirements,rounds});
    if(task.rounds.length+validated.rounds.length>100)throw new Error('累计轮次超过 100，请先归档核对现有任务');
    for(const round of validated.rounds) {
      if(task.rounds.some(previous=>previous.id===round.id))throw new Error('修订轮次需要新的 ID，不能覆盖历史');
      const hash=requestFingerprint({kind:'search',payload:round.filters});
      if(task.rounds.some(previous=>requestFingerprint({kind:'search',payload:previous.filters})===hash))throw new Error('修订不能重复已有搜索条件；复用已有结果');
    }
    const revision={id:`revision-${(task.revisions?.length ?? 0)+1}`,reason,proposedBy,proposedAt,
      basedOn:review.trialFingerprint,roundIds:validated.rounds.map(round=>round.id),supersededRoundIds:[]};
    for(const round of task.rounds) {
      if(['planned','approved'].includes(round.status)) {
        revision.supersededRoundIds.push(round.id);round.status='superseded';
      }
    }
    task.rounds.push(...validated.rounds.map(round=>({...round,status:'planned',revisionId:revision.id})));
    task.revisions ??=[];task.revisions.push(revision);
    task.events.push({type:'revision_proposed',revisionId:revision.id,at:proposedAt});
    return task;
  });
}
export function approveRound(file, roundId, {confirmedAt, scope}) {
  if (!Number.isFinite(Date.parse(confirmedAt)) || typeof scope !== 'string' || !scope.trim()) throw new Error('需要本次明确授权时间和范围');
  return updateTask(file,task=>{
    const round=task.rounds?.find(r=>r.id===roundId);
    if(!round || round.status!=='planned')throw new Error('轮次不存在或已授权执行');
    if(task.status==='paused' || task.operations?.some(op=>['started','unknown'].includes(op.status)))throw new Error('暂停或未知操作尚未解决，不能授权下一轮');
    if(round.phase==='full' && (task.reviews?.at(-1)?.decision!=='proceed'
      || task.reviews.at(-1).trialFingerprint !== trialFingerprint(task)))throw new Error('正式寻访前必须完成当前试搜复核');
    const hash=requestFingerprint({kind:'search',payload:round.filters});
    if(!task.policy){task.policy={allowedKinds:['search'],maxOperations:task.rounds.length,requestHashes:[],confirmedAt,scope};task.operations=[];}
    // An explicit approval of a newly proposed round grants one additional
    // task attempt. Shared site budgets are independent and remain unchanged.
    if(round.revisionId){
      if(task.policy.maxOperations>=cumulativeBudgetLimit(task))throw new Error('任务预算已达已确认上限');
      task.policy.maxOperations++;
      task.events.push({type:'revision_round_approved',roundId,confirmedAt,scope,additionalAttempts:1});
    }
    if(!task.policy.requestHashes.includes(hash))task.policy.requestHashes.push(hash);
    task.status='ready';round.status='approved';round.confirmedAt=confirmedAt;round.scope=scope;
    round.requirementsFingerprint=requirementsFingerprint(task.requirements);
    return task;
  });
}
export function importCandidates(file, rows, {source,stage='list',roundId}) {
  if (!Array.isArray(rows) || rows.length>1000) throw new Error('一次导入须为不超过 1000 条的 JSON 数组');
  const normalized=rows.map(row=>{
    if (!row || typeof row !== 'object' || (row.source && row.source!==source)) throw new Error('数据来源与声明不一致');
    return {...row,source};
  });
  if(stage==='list')return updateTask(file,task=>mergeListResults(task,normalized,{roundId}));
  return saveObservations(file,normalized,{stage,roundId});
}
export function reviewTrial(file, {decision,notes,reviewedAt}) {
  if (!['proceed','revise','stop'].includes(decision) || !notes?.trim() || !Number.isFinite(Date.parse(reviewedAt))) throw new Error('需要有效的人工复核决定、说明和时间');
  return updateTask(file,task=>{
    const trials = task.rounds?.filter(r=>r.phase==='trial' && r.status!=='superseded') ?? [];
    const canReviseUnused=decision==='revise'&&trials.some(r=>r.status==='completed')
      &&trials.every(r=>['completed','planned','approved'].includes(r.status));
    if (!trials.length || (!canReviseUnused&&!trials.every(r=>r.status==='completed'))) throw new Error('尚无完成全部试搜轮次的结果');
    if (task.operations?.some(op => ['started','unknown','blocked','failed'].includes(op.status))) throw new Error('先核对未确认操作，再复核试搜');
    task.reviews.push({decision,notes,reviewedAt,trialFingerprint:trialFingerprint(task)});
    if(decision==='stop')task.status='paused';
    return task;
  });
}

function trialFingerprint(task) {
  return requestFingerprint({kind:'trial-review',payload:task.rounds.filter(r=>r.phase==='trial').map(r=>{const collections=roundCollectionIds(r);return {
    id:r.id,filters:r.filters,status:r.status,operationId:r.operationId,
    ...(r.restorations?.length?{restorations:r.restorations.map(x=>({operationId:x.operationId,collectionRoundId:x.collectionRoundId,status:x.status}))}:{}),
    observations:task.candidates.flatMap(c=>c.observations.filter(o=>collections.has(o.roundId)).map(o=>({key:c.key,hash:o.hash}))),
    unlinked:(task.unlinkedObservations ?? []).filter(o=>collections.has(o.roundId)).map(o=>({id:o.id,hash:o.hash,identityStatus:o.identityStatus,link:o.link})),
  };})});
}

// Driver injection keeps orchestration testable without an account. Production
// callers must pass a reviewed browser driver only after runtime preflight.
export async function runRound(file, roundId, search) {
  const task = readTask(file);
  const round = task.rounds?.find(r => r.id === roundId);
  if (!round || !['approved','interrupted','completed'].includes(round.status)) throw new Error('轮次必须先明确授权');
  if (round.phase === 'full' && round.status !== 'completed' && (task.reviews?.at(-1)?.decision !== 'proceed'
    || task.reviews.at(-1).trialFingerprint !== trialFingerprint(task))) throw new Error('试搜证据已变化或尚未复核，不能开始正式寻访');
  if(round.status!=='completed' && ((round.requirementsFingerprint && round.requirementsFingerprint!==requirementsFingerprint(task.requirements)) || (task.requirements.sources && !round.requirementsFingerprint)))throw new Error('职位需求已变化或尚未确认，先核对方案再执行');
  const operationId = `round-${round.id}`;
  const evidence = await executeScopedOperation(file, {operationId,kind:'search',payload:round.filters}, async () => {
    const result = await search(structuredClone(round.filters));
    if (!result || !Array.isArray(result.rows) || !['completed','blocked','unknown','failed'].includes(result.status)) throw new Error('搜索结果缺少状态或候选人数组');
    // Validate all observations before persisting a successful operation outcome.
    mergeListResults(task,result.rows,{roundId});
    return {status:result.status,evidence:{...result.evidence,rows:result.rows,roundId}};
  });
  return updateTask(file, current => {
    if (!Array.isArray(evidence?.rows) || evidence.roundId !== roundId) throw new Error('缺少可恢复的本轮结果证据，请先人工核对');
    const next = mergeListResults(current,evidence.rows,{roundId});
    const operation = next.operations.find(op => op.operationId === operationId);
    const savedRound = next.rounds.find(r => r.id === roundId);
    savedRound.operationId = operationId;
    savedRound.status = operation.status === 'completed' ? 'completed' : 'interrupted';
    savedRound.resultCount = evidence.rows.length;
    savedRound.unresolvedIdentities = evidence.rows.filter(row=>!row.resumeId && !row.profileUrl).length;
    if (savedRound.status === 'completed') savedRound.completedAt ??= new Date().toISOString();
    return next;
  });
}
