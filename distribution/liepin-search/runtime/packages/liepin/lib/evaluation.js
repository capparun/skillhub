import { updateTask } from './task-store.js';

const statuses = ['supported', 'contradicted', 'unknown'];
// These are observations, not a hiring decision. The caller must supply an exact
// source quote for each assertion; absence is never proof of a contradiction.
export function recordEvaluation(file, input) {
  if (!input || typeof input.reviewer !== 'string' || !input.reviewer.trim()
    || !Number.isFinite(Date.parse(input.reviewedAt)) || !Array.isArray(input.findings)) {
    throw new Error('评估需要审阅者、时间和逐项证据');
  }
  return updateTask(file, task => {
    const candidate = task.candidates.find(c => c.key === input.candidateKey);
    if (!candidate) throw new Error('候选人不存在');
    const criteria = task.requirements.criteria ?? [];
    const seen = new Set();
    const findings = input.findings.map(finding => {
      if (!criteria.some(c => c.id === finding.criterionId) || seen.has(finding.criterionId)) throw new Error('评估条件不存在或重复');
      seen.add(finding.criterionId);
      if (!statuses.includes(finding.status) || typeof finding.reason !== 'string' || !finding.reason.trim()) throw new Error('需要有效的判断状态和理由');
      const evidence = finding.evidence ?? [];
      if (!Array.isArray(evidence) || (finding.status !== 'unknown' && !evidence.length)) throw new Error('明确判断必须有原始证据，不能用缺失推断');
      for (const ref of evidence) {
        const observation = candidate.observations.find(o => o.hash === ref.hash);
        if (!observation || !Array.isArray(ref.path) || !ref.path.length || ref.path.length > 10) throw new Error('证据快照或字段路径无效');
        if (observation.stage === 'detail' && !['readable', 'partial'].includes(observation.data.status)) throw new Error('未确认读取成功的详情不能用作评估证据');
        let value = observation.data;
        for (const key of ref.path) {
          if (!['string', 'number'].includes(typeof key) || ['__proto__', 'prototype', 'constructor'].includes(String(key))
            || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('证据字段不存在');
          value = value[key];
        }
        if (typeof value !== 'string' || typeof ref.quote !== 'string' || !ref.quote.trim() || !value.includes(ref.quote)) throw new Error('证据引用必须逐字存在于保存的原文中');
      }
      return structuredClone({criterionId:finding.criterionId, status:finding.status, reason:finding.reason, evidence});
    });
    for (const criterion of criteria) {
      if (!seen.has(criterion.id)) findings.push({criterionId:criterion.id, status:'unknown', reason:'尚未核实', evidence:[]});
    }
    // "supported" describes the criterion, not suitability. Evidence supporting
    // an exclusion must never be displayed as a positive qualification.
    for(const finding of findings) {
      const criterion=criteria.find(item=>item.id===finding.criterionId);
      finding.kind=criterion.kind;finding.label=criterion.label;
      finding.reviewFlag=finding.status==='unknown'?'待核实':
        criterion.kind==='exclusion' && finding.status==='supported'?'排除项有证据，需人工复核':
        criterion.kind==='required' && finding.status==='contradicted'?'硬性条件有冲突，需人工复核':null;
    }
    candidate.evaluations ??= [];
    candidate.evaluations.push({reviewer:input.reviewer, reviewedAt:input.reviewedAt, findings, requiresHumanReview:true});
    task.events.push({type:'evaluation_recorded', candidateKey:candidate.key, at:new Date().toISOString()});
    return task;
  });
}

export function tagCandidate(file, {candidateKey, tags}) {
  if (!Array.isArray(tags) || tags.length > 30 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) throw new Error('标签须为不超过 30 个、每个 1–80 字的字符串');
  return updateTask(file, task => {
    const candidate = task.candidates.find(c => c.key === candidateKey);
    if (!candidate) throw new Error('候选人不存在');
    const before = [...candidate.tags];
    candidate.tags = [...new Set(tags.map(tag => tag.trim()))];
    task.events.push({type:'tags_updated', candidateKey, before, after:candidate.tags, at:new Date().toISOString()});
    return task;
  });
}
