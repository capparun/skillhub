import { getTierConfig, normalizeTier } from './linkedin-tier.js';

export const LINKEDIN_ORIGIN = 'https://www.linkedin.com';

/**
 * 为当前 tier 生成人才搜索 URL。
 *
 * @param {string} tier
 * @param {Object} params
 * @param {string} params.keyword
 * @param {string[]} [params.geoIds]
 * @param {string[]} [params.currentCompanyIds]
 * @param {string[]} [params.pastCompanyIds]
 * @param {string[]} [params.schoolIds]
 * @param {string[]} [params.languageCodes]
 * @param {string[]} [params.industryIds] - LinkedIn numeric industry IDs (legacy V1 consumer search IDs)
 * @param {string} [params.connection] - '1st' | '2nd' | '3rd' | '3rd+'，支持逗号分隔多选
 * @param {number} [params.start]
 * @param {boolean} [params.forceConsumer] - 强制使用普通消费者搜索路径
 */
export function getPeopleSearchUrl(tier, params = {}) {
  const t = normalizeTier(tier) || 'free';
  const cfg = getTierConfig(t);

  // SN/Recruiter 在通用 scout 中默认仍走消费者路径（调用方负责提示），
  // 除非明确指定或未来扩展了对应命令。
  if (!params.forceConsumer && cfg.supportsSalesNavigatorSearch) {
    return buildSalesNavigatorPeopleSearchUrl(params);
  }
  if (!params.forceConsumer && cfg.supportsRecruiterSearch) {
    return buildRecruiterPeopleSearchUrl(params);
  }

  return buildConsumerPeopleSearchUrl(params);
}

function buildConsumerPeopleSearchUrl({
  keyword = '',
  geoIds = [],
  currentCompanyIds = [],
  pastCompanyIds = [],
  schoolIds = [],
  languageCodes = [],
  industryIds = [],
  connection = '',
  start = 0,
}) {
  const url = new URL('/search/results/people/', LINKEDIN_ORIGIN);
  const sp = url.searchParams;

  if (keyword) sp.set('keywords', keyword);
  if (start > 0) sp.set('start', String(start));

  const connMap = { '1st': 'F', '2nd': 'S', '3rd': 'O', '3rd+': 'O', '1度': 'F', '2度': 'S', '3度': 'O', '3度+': 'O' };
  const connCodes = [...new Set(String(connection)
    .split(',')
    .map(value => connMap[value.trim().toLowerCase()])
    .filter(Boolean))];
  if (connCodes.length > 0) sp.set('network', JSON.stringify(connCodes));

  if (currentCompanyIds.length > 0) sp.set('currentCompany', JSON.stringify(currentCompanyIds));
  if (pastCompanyIds.length > 0) sp.set('pastCompany', JSON.stringify(pastCompanyIds));
  if (geoIds.length > 0) {
    sp.set('geoUrn', JSON.stringify(geoIds));
    sp.set('origin', 'FACETED_SEARCH');
  }
  if (schoolIds.length > 0) {
    sp.set('schoolFilter', JSON.stringify(schoolIds));
    if (!sp.has('origin')) sp.set('origin', 'FACETED_SEARCH');
  }
  if (languageCodes.length > 0) sp.set('profileLanguage', JSON.stringify(languageCodes));
  if (industryIds.length > 0) {
    sp.set('industry', JSON.stringify(industryIds));
    if (!sp.has('origin')) sp.set('origin', 'FACETED_SEARCH');
  }

  return url.toString();
}

function buildSalesNavigatorPeopleSearchUrl({ keyword = '', start = 0 }) {
  const url = new URL('/sales/search/people', LINKEDIN_ORIGIN);
  const sp = url.searchParams;
  if (keyword) sp.set('keywords', keyword);
  if (start > 0) sp.set('start', String(start));
  return url.toString();
}

function buildRecruiterPeopleSearchUrl({ keyword = '', start = 0 }) {
  const url = new URL('/talent/search', LINKEDIN_ORIGIN);
  const sp = url.searchParams;
  sp.set('searchBoolean', keyword);
  sp.set('start', String(start));
  return url.toString();
}

/**
 * 构建 Recruiter boolean search 字符串。
 * 支持字段限定符: title:, company:, geo:
 */
export function buildRecruiterSearchBoolean({ keyword, jobTitles, location, companies, skills, keywords }) {
  const parts = [];
  if (keyword) parts.push(keyword);

  if (jobTitles) {
    const titles = jobTitles.split(',').map(t => t.trim()).filter(Boolean);
    if (titles.length === 1) parts.push(`title:"${titles[0]}"`);
    else if (titles.length > 1) parts.push('(' + titles.map(t => `title:"${t}"`).join(' OR ') + ')');
  }

  if (companies) {
    const comps = companies.split(',').map(c => c.trim()).filter(Boolean);
    if (comps.length === 1) parts.push(`company:"${comps[0]}"`);
    else if (comps.length > 1) parts.push('(' + comps.map(c => `company:"${c}"`).join(' OR ') + ')');
  }

  if (location) {
    const locs = location.split(',').map(l => l.trim()).filter(Boolean);
    if (locs.length === 1) parts.push(`geo:"${locs[0]}"`);
    else if (locs.length > 1) parts.push('(' + locs.map(l => `geo:"${l}"`).join(' OR ') + ')');
  }

  if (skills) {
    const sks = skills.split(',').map(s => s.trim()).filter(Boolean);
    if (sks.length === 1) parts.push(`"${sks[0]}"`);
    else if (sks.length > 1) parts.push('(' + sks.map(s => `"${s}"`).join(' OR ') + ')');
  }

  if (keywords) {
    const kws = keywords.split(',').map(k => k.trim()).filter(Boolean);
    if (kws.length === 1) parts.push(`"${kws[0]}"`);
    else if (kws.length > 1) parts.push('(' + kws.map(k => `"${k}"`).join(' OR ') + ')');
  }

  return parts.join(' AND ');
}

/**
 * 公司搜索 URL。
 */
export function getCompanySearchUrl(tier, keyword) {
  const t = normalizeTier(tier) || 'free';
  const cfg = getTierConfig(t);

  if (cfg.supportsSalesNavigatorSearch) {
    const url = new URL('/sales/search/company', LINKEDIN_ORIGIN);
    url.searchParams.set('keywords', keyword);
    return url.toString();
  }

  const url = new URL('/search/results/companies/', LINKEDIN_ORIGIN);
  url.searchParams.set('keywords', keyword);
  return url.toString();
}

/**
 * 公司主页 URL。
 */
export function getCompanyPageUrl(_tier, vanity) {
  return `${LINKEDIN_ORIGIN}/company/${encodeURIComponent(vanity.replace(/^\//, '').replace(/\/$/, ''))}/`;
}

/**
 * 学校主页 URL。
 */
export function getSchoolPageUrl(_tier, vanity) {
  return `${LINKEDIN_ORIGIN}/school/${encodeURIComponent(vanity.replace(/^\//, '').replace(/\/$/, ''))}/`;
}

/**
 * 个人主页 URL。
 * 默认返回公开 profile URL；可传入 SN/Recruiter 专属 ID 获得对应路径。
 */
export function getProfileUrl(tier, profileId, { salesLeadId, salesLeadName, recruiterProfileHash } = {}) {
  const t = normalizeTier(tier) || 'free';
  const cfg = getTierConfig(t);

  if (cfg.supportsSalesNavigatorSearch && salesLeadId) {
    const name = salesLeadName || '';
    return `${LINKEDIN_ORIGIN}/sales/lead/${encodeURIComponent(salesLeadId)},${encodeURIComponent(name)}`;
  }

  if (cfg.supportsRecruiterSearch && recruiterProfileHash) {
    return `${LINKEDIN_ORIGIN}/talent/profile/${encodeURIComponent(recruiterProfileHash)}`;
  }

  return `${LINKEDIN_ORIGIN}/in/${encodeURIComponent(profileId)}/`;
}

export function getTalentHomeUrl() {
  return `${LINKEDIN_ORIGIN}/talent/home`;
}

export function getSalesHomeUrl() {
  return `${LINKEDIN_ORIGIN}/sales/`;
}

export function getFeedUrl() {
  return `${LINKEDIN_ORIGIN}/feed/`;
}

/**
 * 将任意 LinkedIn URL 归一化为公开 profile URL（/in/{profileId}/）。
 * 无法解析时返回 null。
 */
export function normalizeToPublicProfileUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, LINKEDIN_ORIGIN);
    if (u.pathname.includes('/in/')) {
      const id = u.pathname.split('/in/')[1]?.split('/')[0];
      if (id) return `${LINKEDIN_ORIGIN}/in/${id}/`;
    }
  } catch {
    return null;
  }
  return null;
}
