import { isValidTier, normalizeTier, getTierConfig } from './linkedin-tier.js';

/** Only an explicit current-plan field on the account subscription page is evidence.
 * Product names elsewhere (ads, badges, feed posts) are never subscription proof.
 * Unrecognized layouts intentionally remain unknown; no URL-only entitlement inference.
 */
export function tierFromSubscriptionSnapshot({ url = '', text = '' } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.hostname !== 'www.linkedin.com' || !/^\/premium\/my-premium\/?$/.test(parsed.pathname)) return null;
  const matches = [...text.matchAll(/(?:^|\n)\s*(?:Your current plan|Current plan|Current subscription|当前套餐|当前订阅|您的当前套餐)\s*[:：]?\s*\n?([^\n]+)/gi)];
  const values = matches.map(match => normalizeTier(match[1]));
  return values.length > 0 && values.every(value => value && value === values[0]) ? values[0] : null;
}

async function inspectSubscription(page) {
  if (!page || typeof page.goto !== 'function' || typeof page.evaluate !== 'function') return { tier: null, status: 'unavailable' };
  try {
    await page.goto('https://www.linkedin.com/premium/my-premium/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const url = await page.evaluate('window.location.href');
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.linkedin.com' || /\/(login|authwall|checkpoint|challenge)(?:\/|$)/.test(parsed.pathname)) return { tier: null, status: 'login_or_challenge' };
    const text = await page.evaluate('document.body.innerText');
    const tier = tierFromSubscriptionSnapshot({ url, text });
    return { tier, status: tier ? 'verified' : 'unknown' };
  } catch {
    return { tier: null, status: 'unavailable' };
  }
}

export async function detectTierFromSession(page) {
  return (await inspectSubscription(page)).tier;
}

export async function validateTier(page, expectedTier) {
  const base = { detected: null, expected: expectedTier, verified: false };
  if (expectedTier !== 'unknown' && !isValidTier(expectedTier)) return { ...base, ok: false, severity: 'error', mismatchReason: '配置档位无效，请重新确认具体套餐。' };
  const observation = await inspectSubscription(page);
  if (observation.status === 'login_or_challenge') return { ...base, ok: false, severity: 'error', mismatchReason: '页面出现登录或验证入口，请先人工处理。' };
  if (!observation.tier) {
    const cfg = getTierConfig(expectedTier);
    const requiresEntitlement = cfg.supportsRecruiterSearch || cfg.supportsSalesNavigatorSearch;
    return { ...base, ok: false, severity: requiresEntitlement ? 'error' : 'warning', mismatchReason: '无法核实当前订阅；配置不是账号实测结果，余额未知。请在账号订阅页确认套餐；普通搜索仅按保守预算继续。' };
  }
  if (observation.tier !== expectedTier) return { ...base, detected: observation.tier, ok: false, severity: 'error', mismatchReason: '当前订阅与配置档位不同，请重新确认配置。' };
  return { ...base, detected: observation.tier, verified: true, ok: true, severity: 'none', mismatchReason: '' };
}
