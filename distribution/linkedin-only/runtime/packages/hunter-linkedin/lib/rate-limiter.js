/**
 * 限流工具：基于配置的抖动延迟，替代命令里的硬编码 sleep。
 * 延迟基数来自 ~/.hunter/config.json 的 linkedin.rateLimits。
 */

import { getLinkedInConfig } from './hunter-config.js';

const DEFAULT_DELAYS = {
  search: 5000,
  profileView: 3000,
  companyLookup: 3000,
};

function baseDelayFor(action, cfg) {
  const rl = cfg?.rateLimits || {};
  switch (action) {
    case 'search': return rl.searchDelayMs || DEFAULT_DELAYS.search;
    case 'profileView': return rl.profileViewDelayMs || DEFAULT_DELAYS.profileView;
    case 'companyLookup': return rl.companyLookupDelayMs || DEFAULT_DELAYS.companyLookup;
    default: return DEFAULT_DELAYS.profileView;
  }
}

/**
 * 计算带抖动的延迟毫秒数（base ± 30%，模拟人类节奏）。
 * @param {'search'|'profileView'|'companyLookup'} action
 * @param {object} [cfg] - getLinkedInConfig() 结果；不传则自动读取
 */
export function getJitteredDelay(action, cfg) {
  const config = cfg || getLinkedInConfig();
  const base = baseDelayFor(action, config);
  const jitter = base * 0.3 * (Math.random() * 2 - 1);
  return Math.max(500, Math.round(base + jitter));
}

/**
 * 等待一个带抖动的动作间隔。
 * @param {'search'|'profileView'|'companyLookup'} action
 * @param {object} [cfg]
 */
export async function waitForAction(action, cfg) {
  const ms = getJitteredDelay(action, cfg);
  await new Promise(r => setTimeout(r, ms));
  return ms;
}
