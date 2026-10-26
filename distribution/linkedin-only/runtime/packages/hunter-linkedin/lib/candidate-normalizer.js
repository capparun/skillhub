/**
 * LinkedIn 候选人数据统一 schema 和 normalizer
 *
 * 把 Browser Scout / X-Ray 的原始候选人对象转换为统一格式，
 * 方便下游合并、去重、LLM 评估和报告生成。
 */

const DEFAULT_CANDIDATE = {
  id: null,
  name: null,
  channel: null,
  sources: [],
  title: null,
  company: null,
  location: null,
  city: null,
  age: null,
  gender: null,
  education: null,
  degree: null,
  school: null,
  expYears: null,
  expectCity: null,
  wantJob: null,
  activeStatus: null,
  profileUrl: null,
  resumeUrl: null,
  listPageText: '',
  detailText: null,
  raw: null,
  evaluation: null,
  tag: null,
};

function createCandidate(overrides) {
  return { ...DEFAULT_CANDIDATE, ...overrides };
}

function safeTrim(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function buildLinkedInProfileUrl(profileId) {
  if (!profileId) return null;
  const clean = String(profileId).split('?')[0].replace(/\/$/, '');
  return `https://www.linkedin.com/in/${encodeURIComponent(clean)}/`;
}

/**
 * 标准化 LinkedIn 浏览器 scout 候选人。
 */
export function normalizeLinkedInScoutCandidate(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const profileId = safeTrim(raw.profileId);
  const name = safeTrim(raw.name);
  if (!profileId && !name) return null;

  const listPageText = [
    name,
    raw.title,
    raw.headline,
    raw.location,
    raw.connectionDegree,
    raw.rawName,
  ].filter(Boolean).join(' | ');

  return createCandidate({
    id: profileId || name,
    name,
    channel: 'linkedin',
    sources: ['linkedin'],
    title: safeTrim(raw.title) || safeTrim(raw.headline),
    company: null,
    location: safeTrim(raw.location),
    city: safeTrim(raw.location),
    age: null,
    gender: null,
    education: null,
    degree: null,
    school: null,
    expYears: null,
    expectCity: null,
    wantJob: null,
    activeStatus: null,
    profileUrl: raw.profileUrl || buildLinkedInProfileUrl(profileId),
    resumeUrl: null,
    listPageText,
    detailText: null,
    raw,
  });
}

/**
 * 标准化 LinkedIn X-Ray 结果（来自 linkedin-xray 的 results 数组）
 */
export function normalizeLinkedInXrayCandidate(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const profileId = safeTrim(raw.profileId);
  const name = safeTrim(raw.snippetTitle);
  if (!profileId && !name) return null;

  const snippet = safeTrim(raw.snippet) || safeTrim(raw.snippetText);
  const qualityLocation = raw.quality?.location;
  const location = qualityLocation?.status === 'match'
    ? safeTrim(qualityLocation.declared)
    : null;
  const listPageText = [name, snippet, location].filter(Boolean).join(' | ');

  return createCandidate({
    id: profileId || name,
    name,
    channel: 'linkedin-xray',
    sources: ['linkedin-xray'],
    title: name,
    company: null,
    location,
    city: location,
    age: null,
    gender: null,
    education: null,
    degree: null,
    school: null,
    expYears: null,
    expectCity: null,
    wantJob: null,
    activeStatus: null,
    profileUrl: raw.profileUrl || buildLinkedInProfileUrl(profileId),
    resumeUrl: null,
    listPageText,
    detailText: null,
    raw,
  });
}

const CHANNEL_NORMALIZERS = {
  linkedin: normalizeLinkedInScoutCandidate,
  'linkedin-scout': normalizeLinkedInScoutCandidate,
  'linkedin-xray': normalizeLinkedInXrayCandidate,
};

/**
 * 根据渠道名自动选择 normalizer
 */
export function normalizeCandidate(raw, channel) {
  const normalizer = CHANNEL_NORMALIZERS[channel];
  if (!normalizer) {
    throw new Error(`不支持的渠道: ${channel}`);
  }
  return normalizer(raw);
}

/**
 * 标准化整个渠道输出文件（{ meta, candidates, filteredOut }）
 */
export function normalizeChannelOutput(output, channel) {
  if (!output || typeof output !== 'object') {
    throw new Error('输出必须是对象');
  }

  const rawCandidates = Array.isArray(output.candidates) ? output.candidates : [];
  const rawFilteredOut = Array.isArray(output.filteredOut) ? output.filteredOut : [];

  return {
    meta: output.meta || {},
    candidates: rawCandidates
      .map(c => normalizeCandidate(c, channel))
      .filter(Boolean),
    filteredOut: rawFilteredOut
      .map(c => normalizeCandidate(c, channel))
      .filter(Boolean),
  };
}

/**
 * 快捷函数：从 LinkedIn scout 结果文件（linkedin-scout-result.json）中提取并标准化所有候选人
 */
export function normalizeLinkedInScoutResult(result) {
  if (!result || typeof result !== 'object') return { meta: {}, candidates: [] };

  const rawCandidates = Array.isArray(result.candidates)
    ? result.candidates
    : Array.isArray(result.all)
      ? result.all
      : Array.isArray(result.qualified)
        ? result.qualified
        : [];
  const searchParams = result.meta?.searchParams || result.params || {};

  return {
    meta: {
      ...(result.meta || {}),
      title: searchParams.keyword || result.meta?.title || 'LinkedIn',
      tag: result.summary?.tag || '',
      keywords: [searchParams.keyword].filter(Boolean),
      city: searchParams.location || '不限',
      timestamp: result.meta?.collectedAt || result.timestamp,
      platform: result.meta?.platform || result.platform,
      total: result.meta?.total || result.summary?.total || rawCandidates.length,
      qualified: result.summary?.qualified || 0,
    },
    candidates: rawCandidates
      .map(c => normalizeLinkedInScoutCandidate(c))
      .filter(Boolean),
  };
}

/**
 * 快捷函数：从 LinkedIn X-Ray 结果文件中提取并标准化候选人
 */
export function normalizeLinkedInXrayResult(result) {
  if (!result || typeof result !== 'object') return { meta: {}, candidates: [] };

  const rawResults = Array.isArray(result.results) ? result.results : [];

  return {
    meta: {
      title: result.query || 'LinkedIn X-Ray',
      keywords: [result.query].filter(Boolean),
      city: '不限',
      timestamp: result.collectedAt,
      source: result.source,
      accountTier: result.accountTier,
      total: rawResults.length,
    },
    candidates: rawResults
      .map(c => normalizeLinkedInXrayCandidate(c))
      .filter(Boolean),
  };
}
