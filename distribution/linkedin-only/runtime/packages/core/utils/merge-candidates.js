/**
 * 跨渠道候选人合并 / 去重
 *
 * 接收多个已标准化的候选人数组，输出去重后的合并数组。
 */

function safeTrim(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function normalizeKey(value) {
  return safeTrim(value)
    .replace(/[^一-龥a-z0-9]/gi, '')
    .replace(/\s+/g, '');
}

function isNonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function countFields(candidate) {
  const fields = [
    'title', 'company', 'location', 'city', 'age', 'gender',
    'education', 'school', 'expYears', 'expectCity', 'wantJob',
    'activeStatus', 'profileUrl', 'resumeUrl', 'detailText'
  ];
  return fields.reduce((count, field) => count + (isNonEmpty(candidate[field]) ? 1 : 0), 0);
}

/**
 * 合并两个重复候选人为一条记录
 * 规则：保留字段更全的作为基础，合并 sources，拼接 listPageText
 */
function mergeDuplicatePair(a, b) {
  const base = countFields(a) >= countFields(b) ? { ...a } : { ...b };
  const other = countFields(a) >= countFields(b) ? b : a;

  // 合并渠道来源
  const sources = [...new Set([...(base.sources || []), ...(other.sources || [])])];
  base.sources = sources;
  base.channel = sources[0] || base.channel;

  // 合并列表页文本（去重）
  const texts = [base.listPageText, other.listPageText]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  base.listPageText = texts.join('\n---\n');

  // 如果 base 缺少某些字段，从 other 补
  const fillFields = [
    'title', 'company', 'location', 'city', 'age', 'gender',
    'education', 'degree', 'school', 'expYears', 'expectCity',
    'wantJob', 'activeStatus', 'profileUrl', 'resumeUrl', 'detailText'
  ];
  for (const field of fillFields) {
    if (!isNonEmpty(base[field]) && isNonEmpty(other[field])) {
      base[field] = other[field];
    }
  }

  // 保留两个原始记录用于调试
  base._mergedFrom = [base.raw, other.raw];

  return base;
}

/**
 * 判断两个候选人是否可能为同一人
 */
function isSamePerson(a, b) {
  const isGllue = c => c.channel === 'gllue' || c.sources?.includes('gllue');
  if (isGllue(a) || isGllue(b)) {
    // ATS 的不同记录不能用姓名等弱线索自动合并；跨渠道身份留给人工审核。
    if (!isGllue(a) || !isGllue(b)) return false;
    const identity = c => {
      try {
        const url = new URL(c.profileUrl || c.resumeUrl);
        const id = url.searchParams.get('id');
        return ['https:', 'http:'].includes(url.protocol) && url.pathname === '/crm/candidate/detail' && /^\d+$/.test(id || '')
          ? `${url.origin}/crm/candidate/detail?id=${id}` : null;
      } catch { return null; }
    };
    const key = identity(a);
    return key !== null && key === identity(b);
  }
  // 1. 有相同的 profileUrl / resumeUrl
  if (isNonEmpty(a.profileUrl) && isNonEmpty(b.profileUrl)) {
    const urlA = String(a.profileUrl).split('?')[0].replace(/\/$/, '');
    const urlB = String(b.profileUrl).split('?')[0].replace(/\/$/, '');
    if (urlA === urlB) return true;
  }
  if (isNonEmpty(a.resumeUrl) && isNonEmpty(b.resumeUrl)) {
    const urlA = String(a.resumeUrl).split('?')[0].replace(/\/$/, '');
    const urlB = String(b.resumeUrl).split('?')[0].replace(/\/$/, '');
    if (urlA === urlB) return true;
  }

  // 2. name + company + title 都非空且相同
  const nameA = normalizeKey(a.name);
  const nameB = normalizeKey(b.name);
  const companyA = normalizeKey(a.company);
  const companyB = normalizeKey(b.company);
  const titleA = normalizeKey(a.title);
  const titleB = normalizeKey(b.title);

  if (nameA && nameA === nameB &&
      companyA && companyA === companyB &&
      titleA && titleA === titleB) {
    return true;
  }

  // 3. name 相同 + location 相同（作为较弱信号，仅当信息较少时）
  if (nameA && nameA === nameB &&
      isNonEmpty(a.location) && isNonEmpty(b.location) &&
      normalizeKey(a.location) === normalizeKey(b.location) &&
      (!companyA || !titleA)) {
    return true;
  }

  return false;
}

/**
 * 合并多个渠道的候选人数组并去重
 *
 * @param {Array<Array>} channelArrays - 每个渠道的标准化候选人数组
 * @param {object} options
 * @param {boolean} options.keepFirstChannelOrder - 是否优先保留先出现的渠道记录（默认 true）
 * @returns {object} { candidates: Array, duplicateCount: number, sourceCounts: object }
 */
export function mergeCandidates(channelArrays, options = {}) {
  const { keepFirstChannelOrder = true } = options;

  const all = channelArrays
    .flat()
    .filter(c => c && typeof c === 'object' && isNonEmpty(c.name));

  const merged = [];
  let duplicateCount = 0;

  for (const candidate of all) {
    let foundIndex = -1;
    for (let i = 0; i < merged.length; i++) {
      if (isSamePerson(merged[i], candidate)) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 0) {
      duplicateCount++;
      const existing = merged[foundIndex];
      const [first, second] = keepFirstChannelOrder
        ? [existing, candidate]
        : [countFields(existing) >= countFields(candidate) ? existing : candidate, countFields(existing) >= countFields(candidate) ? candidate : existing];
      merged[foundIndex] = mergeDuplicatePair(first, second);
    } else {
      merged.push({ ...candidate });
    }
  }

  const sourceCounts = merged.reduce((acc, c) => {
    for (const source of (c.sources || [])) {
      acc[source] = (acc[source] || 0) + 1;
    }
    return acc;
  }, {});

  return {
    candidates: merged,
    duplicateCount,
    sourceCounts,
    totalInput: all.length,
    totalOutput: merged.length,
  };
}

/**
 * 兼容旧命名：mergeAndDeduplicate
 */
export function mergeAndDeduplicate(channelArrays, options = {}) {
  return mergeCandidates(channelArrays, options);
}
