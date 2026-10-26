const RESUME_FIELDS = ['title', 'company', 'location', 'detailText', 'experience', 'education'];

function collectText(value, path, output) {
  if (typeof value === 'string' && value.trim()) {
    output.push({ source: path, text: value.trim() });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectText(item, `${path}[${index}]`, output));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectText(item, `${path}.${key}`, output);
  }
}

function validateScoring(scoring) {
  if (!scoring || !Array.isArray(scoring.criteria) || scoring.criteria.length === 0) {
    throw new Error('评分规则至少一个评分项');
  }
  if (!Number.isFinite(scoring.passScore) || scoring.passScore < 0 || scoring.passScore > 100) {
    throw new Error('passScore 必须为 0-100');
  }
  const ids = new Set();
  let totalWeight = 0;
  for (const item of scoring.criteria) {
    if (!item?.id || !item.label || ids.has(item.id)) throw new Error('评分项 id/label 必须存在且 id 唯一');
    ids.add(item.id);
    if (!Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100) throw new Error('评分项 weight 必须为 0-100');
    totalWeight += item.weight;
    if (!Array.isArray(item.evidenceTerms) || item.evidenceTerms.length === 0 ||
        item.evidenceTerms.some(term => typeof term !== 'string' || !term.trim())) {
      throw new Error('评分项 evidenceTerms 必须包含非空字符串');
    }
  }
  if (totalWeight > 100) throw new Error('评分项 weight 总和不能超过 100');
}

/**
 * 对标准化候选人的已观察简历字段进行证据驱动评分。
 * 未命中只表示证据未知，不推断候选人不具备该能力。
 */
export function evaluateEvidenceCandidate(candidate, scoring, options = {}) {
  validateScoring(scoring);
  const observed = [];
  for (const field of RESUME_FIELDS) collectText(candidate?.[field], field, observed);

  const evidence = scoring.criteria.map(item => {
    const hit = observed.find(entry => item.evidenceTerms.some(term =>
      entry.text.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase())));
    if (hit) {
      const term = item.evidenceTerms.find(value =>
        hit.text.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
      return { criterion: item.id, label: item.label, required: item.required === true,
        status: 'met', points: item.weight, source: hit.source, quote: term.trim() };
    }
    return { criterion: item.id, label: item.label, required: item.required === true,
      status: 'unknown', points: 0, reason: '未观察到对应证据，不等于不具备' };
  });
  const score = evidence.reduce((sum, item) => sum + item.points, 0);
  const requiredUnknown = evidence.some(item => item.required && item.status !== 'met');
  const qualified = !requiredUnknown && score >= scoring.passScore;
  return {
    jbfVersion: options.jbfVersion || null,
    score,
    qualified,
    status: requiredUnknown ? 'pending_evidence' : qualified ? 'qualified' : 'not_qualified',
    evidence,
    missingFields: evidence.filter(item => item.status === 'unknown').map(item => item.label)
  };
}
