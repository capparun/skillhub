/**
 * LinkedIn 账号档位定义与查询工具
 *
 * InMail 数字为套餐参考配额，不是账号当前余额。
 * dailyProfileViewSafe / maxResultsPerSearch 是本地执行预算，不是官方限制或安全保证。
 * 社区估计值（如免费账号 CUL ~250-350/月）不放在本文件中，由调用方按需标注。
 */

export const LINKEDIN_TIERS = {
  free: {
    label: 'Free',
    inmailMonthly: 0,
    inmailRollMax: 0,
    maxResultsPerSearch: 10,
    dailyProfileViewSafe: 20,
    hasCul: true,
    supportsRecruiterSearch: false,
    supportsSalesNavigatorSearch: false,
    searchPath: '/search/results/people/',
    profilePath: '/in/{profileId}/',
    defaultDiscovery: 'xray'
  },
  premium_career: {
    label: 'Premium Career',
    inmailMonthly: 5,
    inmailRollMax: 15,
    maxResultsPerSearch: 10,
    dailyProfileViewSafe: 30,
    hasCul: true,
    supportsRecruiterSearch: false,
    supportsSalesNavigatorSearch: false,
    searchPath: '/search/results/people/',
    profilePath: '/in/{profileId}/',
    defaultDiscovery: 'xray'
  },
  premium_business: {
    label: 'Premium Business',
    inmailMonthly: 15,
    inmailRollMax: 45,
    maxResultsPerSearch: 50,
    dailyProfileViewSafe: 100,
    hasCul: false,
    supportsRecruiterSearch: false,
    supportsSalesNavigatorSearch: false,
    searchPath: '/search/results/people/',
    profilePath: '/in/{profileId}/',
    defaultDiscovery: 'browser'
  },
  sales_navigator: {
    label: 'Sales Navigator',
    inmailMonthly: 50,
    inmailRollMax: 150,
    maxResultsPerSearch: 100,
    dailyProfileViewSafe: 200,
    hasCul: false,
    supportsRecruiterSearch: false,
    supportsSalesNavigatorSearch: true,
    searchPath: '/sales/search/people',
    profilePath: '/sales/lead/{id},{name}',
    defaultDiscovery: 'browser'
  },
  recruiter_lite: {
    label: 'Recruiter Lite',
    inmailMonthly: 30,
    inmailRollMax: 120,
    maxResultsPerSearch: 100,
    dailyProfileViewSafe: 200,
    hasCul: false,
    supportsRecruiterSearch: true,
    supportsSalesNavigatorSearch: false,
    searchPath: '/talent/search',
    profilePath: '/talent/profile/{hash}',
    defaultDiscovery: 'browser'
  },
  recruiter_corporate: {
    label: 'Recruiter Corporate',
    inmailMonthly: 150,
    inmailRollMax: 150,
    maxResultsPerSearch: 150,
    dailyProfileViewSafe: 300,
    hasCul: false,
    supportsRecruiterSearch: true,
    supportsSalesNavigatorSearch: false,
    searchPath: '/talent/search',
    profilePath: '/talent/profile/{hash}',
    defaultDiscovery: 'browser'
  },
  rps: {
    label: 'RPS (Recruiter Professional Services)',
    inmailMonthly: 100,
    inmailRollMax: 100,
    maxResultsPerSearch: 150,
    dailyProfileViewSafe: 300,
    hasCul: false,
    supportsRecruiterSearch: true,
    supportsSalesNavigatorSearch: false,
    searchPath: '/talent/search',
    profilePath: '/talent/profile/{hash}',
    defaultDiscovery: 'browser'
  },
};

export const TIER_KEYS = Object.freeze(Object.keys(LINKEDIN_TIERS));

/**
 * 将用户可能输入/检测到的别名映射为标准 tier key。
 */
const TIER_ALIASES = {
  recruiter: 'recruiter_corporate',
  recruiter_pro: 'rps',
  rps: 'rps',
  sn: 'sales_navigator',
  salesnav: 'sales_navigator',
  'sales navigator': 'sales_navigator',
  'sales-navigator': 'sales_navigator',
  career: 'premium_career',
  business: 'premium_business',
  'premium career': 'premium_career',
  'premium business': 'premium_business',
};

export function isValidTier(tier) {
  return typeof tier === 'string' && TIER_KEYS.includes(tier);
}

export function normalizeTier(tier) {
  if (!tier) return null;
  const key = String(tier).trim().toLowerCase().replace(/\s+/g, ' ');
  if (TIER_KEYS.includes(key)) return key;
  return TIER_ALIASES[key] || null;
}

export function getTierConfig(tier) {
  const key = normalizeTier(tier);
  return key ? LINKEDIN_TIERS[key] : { ...LINKEDIN_TIERS.free, label: '未知（未核实）', inmailMonthly: null, inmailRollMax: null };
}

export function getTierLabel(tier) {
  return getTierConfig(tier).label;
}

/**
 * 根据 tier 返回推荐的默认发现路径。
 * - free / premium_career：优先 xray（不耗 CUL）
 * - 付费档：browser
 */
export function getDefaultDiscovery(tier) {
  return getTierConfig(tier).defaultDiscovery;
}

/**
 * 按官方数字生成 InMail 额度提示文案。
 */
export function formatInMailQuota(tier) {
  const cfg = getTierConfig(tier);
  if (cfg.inmailMonthly === null) return '账号套餐未知；InMail 每月配额与当前余额均未核实。';
  if (cfg.inmailMonthly === 0) {
    return '配置档位没有 InMail 额度；实际账号未核实，Open Profile 等免费消息入口以页面为准。';
  }
  return `按配置档位的 InMail 套餐参考配额：${cfg.inmailMonthly} 封/月（滚存上限 ${cfg.inmailRollMax}）。这不是当前余额；实际剩余、续期与返还以账号页面为准。`;
}

/**
 * 是否需要提示 CUL 风险。
 */
export function hasCommercialUseLimit(tier) {
  return getTierConfig(tier).hasCul;
}

/** Whether the configured product tier is allowed to enter Recruiter search. */
export function supportsRecruiterSearch(tier) {
  return getTierConfig(tier).supportsRecruiterSearch === true;
}
