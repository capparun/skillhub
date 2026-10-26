/**
 * LinkedIn 候选人评估器
 * 从搜索结果中提取的列表页字段有限，因此评估聚焦在：
 * - 关键词匹配（headline / title / summary / name）
 * - 目标公司匹配
 * - 目标地点匹配
 * - 人脉关系度加分
 *
 * 输出统一 evaluation schema，供 linkedin-report 使用。
 */

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[\s,，;；]+/g, ' ').trim();
}

function candidateText(candidate) {
  return normalizeText(
    `${candidate.headline} ${candidate.title} ${candidate.summary} ${candidate.name} ${candidate.listPageText} ${candidate.detailText}`
  );
}

function candidateTitleText(candidate) {
  return normalizeText(`${candidate.headline} ${candidate.title}`);
}

/**
 * 应用寻访方案 filters 层硬规则。
 * 只对有数据的字段判淘汰；数据缺失返回 pendingNotes，不淘汰。
 * @returns {{rejectReasons: string[], pendingNotes: string[]}}
 */
export function applyPlanFilters(candidate, filters = {}) {
  const rejectReasons = [];
  const pendingNotes = [];
  const text = candidateText(candidate);
  const titleText = candidateTitleText(candidate);

  for (const word of filters.titleMustInclude || []) {
    const needle = normalizeText(word);
    if (!needle) continue;
    if (titleText && !titleText.includes(needle)) rejectReasons.push(`头衔缺少必含项: ${word}`);
    else if (!titleText) pendingNotes.push(`头衔必含项待详情确认: ${word}`);
  }
  for (const word of filters.titleExclude || []) {
    const needle = normalizeText(word);
    if (needle && titleText.includes(needle)) rejectReasons.push(`命中头衔排除项: ${word}`);
  }
  for (const company of filters.excludedCompanies || []) {
    const needle = normalizeText(company);
    if (needle && candidate.company && normalizeText(candidate.company).includes(needle)) {
      rejectReasons.push(`命中排除公司: ${candidate.company}`);
    }
  }

  const minYears = Number(filters.minExperienceYears || 0);
  if (minYears > 0) {
    const years = extractExperienceYears(candidate);
    if (years === null) pendingNotes.push(`最低年限 ${minYears} 年待详情确认`);
    else if (years < minYears) rejectReasons.push(`经验 ${years} 年 < 要求 ${minYears} 年`);
  }

  return { rejectReasons, pendingNotes };
}

/**
 * 从候选人详情经历估算总年限；无结构化经历数据时返回 null。
 */
function extractExperienceYears(candidate) {
  const items = candidate.detail?.experience ?? candidate.experience ?? null;
  if (!Array.isArray(items) || !items.length) return null;
  let total = 0;
  let parsed = 0;
  const now = new Date();
  for (const item of items) {
    const range = String(item?.date_range || item?.dateRange || '');
    const years = parseRangeYears(range, now);
    if (years !== null) { total += years; parsed++; }
  }
  return parsed ? Math.round(total) : null;
}

function parseRangeYears(range, now) {
  const match = range.match(/(\d{4})\s*[-–—]\s*(\d{4}|present|至今|now)/i);
  if (!match) return null;
  const start = Number(match[1]);
  if (!start || start < 1950 || start > now.getFullYear()) return null;
  const endRaw = match[2];
  const end = /present|至今|now/i.test(endRaw) ? now.getFullYear() : Number(endRaw);
  const years = end - start;
  return years >= 0 && years < 60 ? years : null;
}

/**
 * 从寻访方案构建评估条件（channelPlans.<channel>）。
 * @param {object} plan - { search, filters, scoring }
 * @returns {object} criteria（含 filters / weights / derived）
 */
export function buildCriteriaFromPlan(plan = {}) {
  const search = plan.search || {};
  const filters = plan.filters || {};
  const scoring = plan.scoring || {};

  const keywords = new Set();
  (scoring.mustHave || []).forEach(k => keywords.add(k));
  (filters.requiredSkills || []).forEach(k => keywords.add(k));
  (search.keywords || []).forEach(k => keywords.add(k));

  const targetCompanies = new Set();
  (filters.preferredCompanies || []).forEach(c => targetCompanies.add(c));
  (search.pastCompany || []).forEach(c => targetCompanies.add(c));
  (search.currentCompany || []).forEach(c => targetCompanies.add(c));

  const targetLocations = new Set();
  (filters.locationMatch || []).forEach(l => targetLocations.add(l));
  if (search.location) targetLocations.add(search.location);

  return {
    keywords: Array.from(keywords),
    targetCompanies: Array.from(targetCompanies),
    targetLocations: Array.from(targetLocations),
    minScore: 25,
    planFilters: {
      titleMustInclude: filters.titleMustInclude || [],
      titleExclude: filters.titleExclude || [],
      excludedCompanies: filters.excludedCompanies || [],
      requiredSkills: filters.requiredSkills || [],
      minExperienceYears: filters.minExperienceYears || 0,
    },
    niceToHave: scoring.niceToHave || [],
    weights: scoring.weights || null,
    derived: filters.derived || [],
  };
}

/**
 * 权重加权打分：skills / company / experience 三维归一后加权。
 */
function weightedDimensionScore(dims, weights) {
  const w = weights || {};
  const wSkills = Number(w.skills || 0);
  const wCompany = Number(w.company || 0);
  const wExperience = Number(w.experience || 0);
  const sum = wSkills + wCompany + wExperience;
  if (!sum) return null;
  const skillsDim = Math.min(100, Math.round((dims.keywordRatio ?? 0) * 100));
  const companyDim = dims.companyMatch ? 100 : 0;
  const expParts = [];
  if (dims.locationMatch) expParts.push(60);
  expParts.push(dims.degreeScore ?? 0);
  if (dims.years !== null && dims.years !== undefined) expParts.push(Math.min(40, dims.years * 4));
  const expDim = expParts.length ? Math.min(100, Math.round(expParts.reduce((a, b) => a + b, 0) / expParts.length)) : 0;
  return Math.round((skillsDim * wSkills + companyDim * wCompany + expDim * wExperience) / sum);
}

/**
 * 评估单个 LinkedIn 候选人
 * @param {object} candidate - 候选人对象
 * @param {object} criteria - 评估条件
 * @param {string|string[]} criteria.keywords - 关键词（支持逗号/空格分隔）
 * @param {string|string[]} criteria.targetCompanies - 目标公司列表
 * @param {string|string[]} criteria.targetLocations - 目标地点列表
 * @param {number} criteria.minScore - 合格分数线（默认 25）
 * @returns {object} { score, level, reasons, qualified }
 */
export function evaluateLinkedInCandidate(candidate, criteria = {}) {
  const minScore = criteria.minScore ?? 25;
  let score = 0;
  const reasons = [];

  // 0. 寻访方案 filters 层：硬淘汰优先
  let filterResult = null;
  if (criteria.planFilters) {
    const applied = applyPlanFilters(candidate, criteria.planFilters);
    if (applied.rejectReasons.length) {
      return {
        score: 0,
        level: 'rejected',
        reasons: applied.rejectReasons,
        pendingNotes: applied.pendingNotes,
        filtered: true,
        qualified: false,
      };
    }
    filterResult = applied;
  }

  const text = candidateText(candidate);

  // 1. 关键词匹配：优先完整短语，再拆词
  const rawKeywords = criteria.keywords || [];
  const keywordList = Array.isArray(rawKeywords)
    ? rawKeywords
    : rawKeywords.split(/[,，\s]+/).filter(Boolean);

  if (keywordList.length > 0) {
    const phrase = keywordList.join(' ').toLowerCase().trim();
    if (phrase.length >= 3 && text.includes(phrase)) {
      score += 30;
      reasons.push(`匹配核心关键词: ${keywordList.join(' ')}`);
    } else {
      let keywordMatches = 0;
      for (const kw of keywordList) {
        const kwLower = kw.toLowerCase().trim();
        if (kwLower.length >= 2 && text.includes(kwLower)) {
          score += 10;
          keywordMatches++;
        }
      }
      if (keywordMatches > 0) {
        reasons.push(`匹配 ${keywordMatches} 个关键词`);
      }
    }
  }

  // 2. 目标公司匹配
  const rawCompanies = criteria.targetCompanies || [];
  const companyList = Array.isArray(rawCompanies)
    ? rawCompanies
    : rawCompanies.split(/[,，\s]+/).filter(Boolean);

  if (companyList.length > 0 && candidate.company) {
    const companyLower = normalizeText(candidate.company);
    for (const tc of companyList) {
      if (companyLower.includes(tc.toLowerCase())) {
        score += 15;
        reasons.push(`目标公司: ${candidate.company}`);
        break;
      }
    }
  }

  // 3. 目标地点匹配
  const rawLocations = criteria.targetLocations || [];
  const locationList = Array.isArray(rawLocations)
    ? rawLocations
    : rawLocations.split(/[,，\s]+/).filter(Boolean);

  const hasVerifiedLocation = candidate.raw?.quality?.location?.status === 'match';
  const locationText = hasVerifiedLocation
    ? `${candidate.location || ''} ${candidate.listPageText || ''}`
    : candidate.location || '';
  if (locationList.length > 0 && locationText) {
    const locLower = normalizeText(locationText);
    for (const loc of locationList) {
      if (locLower.includes(loc.toLowerCase())) {
        score += 5;
        reasons.push(`地点匹配: ${candidate.location || loc}`);
        break;
      }
    }
  }

  // 4. 人脉关系度加分
  const degree = candidate.connectionDegree || '';
  if (degree.includes('1')) {
    score += 10;
    reasons.push('1度人脉');
  } else if (degree.includes('2')) {
    score += 5;
    reasons.push('2度人脉');
  }

  // 1b. 方案 requiredSkills：命中加分、缺失提示
  let keywordRatio = null;
  if (criteria.planFilters?.requiredSkills?.length) {
    const hits = criteria.planFilters.requiredSkills.filter(skill => text.includes(normalizeText(skill)));
    keywordRatio = criteria.planFilters.requiredSkills.length ? hits.length / criteria.planFilters.requiredSkills.length : 0;
    if (hits.length) reasons.push(`技能命中 ${hits.length}/${criteria.planFilters.requiredSkills.length}: ${hits.join('、')}`);
    const misses = criteria.planFilters.requiredSkills.filter(skill => !hits.includes(skill));
    if (misses.length) reasons.push(`技能待确认: ${misses.join('、')}`);
  }

  // 1c. niceToHave 加分
  for (const item of criteria.niceToHave || []) {
    if (text.includes(normalizeText(item))) {
      score += 5;
      reasons.push(`加分项: ${item}`);
    }
  }

  // 5. 权重加权（寻访方案 scoring.weights）
  let weighted = null;
  if (criteria.weights) {
    const degreeNum = String(candidate.connectionDegree || '').includes('1') ? 10 : String(candidate.connectionDegree || '').includes('2') ? 5 : 0;
    const years = extractExperienceYears(candidate);
    const locMatched = reasons.some(r => r.startsWith('地点匹配'));
    const companyMatched = reasons.some(r => r.startsWith('目标公司'));
    weighted = weightedDimensionScore({
      keywordRatio: keywordRatio ?? null,
      companyMatch: companyMatched,
      locationMatch: locMatched,
      degreeScore: degreeNum,
      years,
    }, criteria.weights);
    if (weighted !== null) {
      score = weighted;
      reasons.push('加权打分(方案权重)');
    }
  }

  // 6. 规整到 0-100
  score = Math.min(100, Math.max(0, score));

  const result = {
    score,
    level: score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low',
    reasons,
    qualified: score >= minScore
  };
  if (filterResult?.pendingNotes?.length) result.pendingNotes = filterResult.pendingNotes;
  if (criteria.weights && weighted !== null) result.weighted = true;
  if (criteria.derived?.length) result.derivedRules = criteria.derived;
  return result;
}

/**
 * 批量评估候选人
 * @param {object[]} candidates
 * @param {object} criteria
 * @returns {object[]} 每个 candidate 附加 evaluation 字段
 */
export function evaluateLinkedInCandidates(candidates, criteria = {}) {
  return (candidates || []).map(candidate => ({
    ...candidate,
    evaluation: evaluateLinkedInCandidate(candidate, criteria)
  }));
}

/**
 * 从 JD 配置提取评估条件
 * @param {object} jdConfig
 * @param {object} searchParams - 原始搜索参数（keyword/location 等）
 * @param {object} overrides - 命令行显式覆盖项（如 minScore）
 * @returns {object} criteria
 */
export function buildCriteriaFromJD(jdConfig = {}, searchParams = {}, overrides = {}) {
  const hard = jdConfig.hard_requirements || {};
  const bonus = jdConfig.bonus_items || {};

  const keywords = new Set();
  (hard.must_have_keywords || []).forEach(k => keywords.add(k));
  (bonus.skills || []).forEach(k => keywords.add(k));
  if (searchParams.keyword) {
    keywords.add(searchParams.keyword.trim());
  }

  const targetCompanies = new Set();
  (hard.company_background || []).forEach(c => targetCompanies.add(c));
  (bonus.target_companies || []).forEach(c => targetCompanies.add(c));

  const targetLocations = new Set();
  if (searchParams.location) {
    searchParams.location.split(/[,，\s]+/).filter(Boolean).forEach(l => targetLocations.add(l));
  }
  (jdConfig.city || '').split(/[,，\s]+/).filter(Boolean).forEach(c => targetLocations.add(c));

  return {
    keywords: Array.from(keywords),
    targetCompanies: Array.from(targetCompanies),
    targetLocations: Array.from(targetLocations),
    minScore: overrides.minScore ?? jdConfig.scoring?.pass_score ?? searchParams.minScore ?? 25
  };
}

export const __test__ = {
  evaluateLinkedInCandidate,
  evaluateLinkedInCandidates,
  buildCriteriaFromJD
};
