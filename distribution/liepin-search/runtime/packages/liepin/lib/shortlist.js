import {createHash} from 'node:crypto';
import {updateTask} from './task-store.js';
import {rankingFingerprint} from './ranking.js';

const criteriaHash = task => createHash('sha256').update(JSON.stringify(task.requirements.criteria ?? [])).digest('hex');
const nonempty = value => typeof value === 'string' && Boolean(value.trim());

export function currentShortlist(task) {
  const record = task.shortlists?.at(-1);
  if (!record || record.criteriaHash !== criteriaHash(task)) return null;
  if (record.stage === 'final' && record.fingerprint !== rankingFingerprint(task)) return null;
  return record;
}

/** Preserve explicitly supplied review decisions; never choose people by a hidden score. */
export function recordShortlist(file, input) {
  if (!input || !['preliminary','final'].includes(input.stage) || !nonempty(input.reviewer) ||
      !Number.isFinite(Date.parse(input.reviewedAt)) || !Array.isArray(input.entries)) {
    throw new Error('短名单需要阶段、审阅者、时间和候选条目');
  }
  return updateTask(file, task => {
    const preliminary = task.shortlists?.findLast(record => record.stage === 'preliminary');
    if (input.stage === 'preliminary' && (typeof input.deepReview !== 'boolean' || !nonempty(input.decisionReason))) {
      throw new Error('初选需要明确是否深读及决定依据');
    }
    if (input.stage === 'final' && (!preliminary || preliminary.criteriaHash !== criteriaHash(task))) {
      throw new Error('最终名单需要当前岗位条件下的初选名单');
    }
    const seen = new Set();
    const entries = input.entries.map(entry => {
      const candidate = task.candidates.find(item => item.key === entry.candidateKey);
      if (!candidate || seen.has(candidate.key)) throw new Error('短名单候选人不存在或重复');
      seen.add(candidate.key);
      if (!nonempty(entry.reason) || !Array.isArray(entry.evidenceGaps) || entry.evidenceGaps.some(gap => !nonempty(gap))) {
        throw new Error('每位候选人需要理由与待核实项数组');
      }
      const evaluation = candidate.evaluations?.at(-1);
      if (!evaluation) throw new Error('短名单条目必须先保存证据评估');
      if (input.stage === 'preliminary' || !preliminary.deepReview) {
        const listHashes = new Set(candidate.observations.filter(observation => observation.stage === 'list').map(observation => observation.hash));
        if (evaluation.findings.some(finding => finding.evidence.some(ref => !listHashes.has(ref.hash)))) {
          throw new Error('列表初评或未深读名单只能引用已保存的列表证据');
        }
      }
      const initial = preliminary?.entries.find(item => item.candidateKey === candidate.key);
      if (input.stage === 'final') {
        if (!initial) throw new Error('最终名单候选人必须来自初选；新增人选先更新初选');
        if (!nonempty(entry.changeReason)) throw new Error('最终名单必须说明复评变化或保持原因');
        if (preliminary.deepReview) {
          if (candidate.evaluations.length <= initial.evaluationCount) throw new Error('深读后需要单独保存复评，不能沿用初评');
          const detailHashes = new Set(candidate.observations.filter(observation => observation.stage === 'detail' &&
            ['readable','partial'].includes(observation.data.status)).map(observation => observation.hash));
          if (!evaluation.findings.some(finding => finding.evidence.some(ref => detailHashes.has(ref.hash)))) {
            throw new Error('深读复评必须引用已成功读取的详情证据');
          }
        }
      }
      return {
        candidateKey:candidate.key, reason:entry.reason.trim(), evidenceGaps:[...entry.evidenceGaps],
        evaluationCount:candidate.evaluations.length,
        initialEvaluation:structuredClone(input.stage === 'preliminary' ? evaluation : initial.initialEvaluation),
        ...(input.stage === 'final' ? {finalEvaluation:structuredClone(evaluation),changeReason:entry.changeReason.trim(),
          evidenceLevel:preliminary.deepReview ? 'visible_detail' : 'list_only'} : {}),
      };
    });
    task.shortlists ??= [];
    task.shortlists.push({stage:input.stage,reviewer:input.reviewer.trim(),reviewedAt:input.reviewedAt,
      deepReview:input.stage === 'preliminary' ? input.deepReview : preliminary.deepReview,
      decisionReason:input.stage === 'preliminary' ? input.decisionReason.trim() : preliminary.decisionReason,
      criteriaHash:criteriaHash(task),fingerprint:rankingFingerprint(task),entries});
    task.events.push({type:'shortlist_recorded',stage:input.stage,count:entries.length,at:new Date().toISOString()});
    return task;
  });
}
