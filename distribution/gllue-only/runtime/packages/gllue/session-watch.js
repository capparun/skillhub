import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { getConfig, getSelectors } from './lib/auth.js';

// OpenCLI's browser command has a 60-second runtime limit by default.
const MAX_SECONDS = 50;
const SAMPLE_INTERVAL_MS = 250;
const AUTH_MESSAGE = /未登录|登录(?:已)?失效|登录过期|会话(?:已)?过期|请重新登录|unauthori[sz]ed|session expired|login required/i;
const MODES = new Set(['capture', 'performance']);

function safePath(raw, domain) {
  try {
    const url = new URL(raw);
    return url.hostname === domain ? url.pathname.replace(/\d{3,}/g, ':id') : null;
  } catch {
    return null;
  }
}

function authSignal(entry, domain) {
  const path = safePath(entry?.url, domain);
  if (!path || !path.startsWith('/rest/')) return null;
  if (Number(entry.responseStatus) === 401) return { signal: 'http_401', evidence: `${entry.method || 'REQUEST'} ${path}: HTTP 401` };

  // The preview stays in memory. Never return or persist response bodies, query strings, cookies or tokens.
  const preview = entry.responsePreview;
  if (typeof preview !== 'string' || !preview) return null;
  try {
    const data = JSON.parse(preview);
    const message = [data?.message, data?.msg, data?.error, data?.errorMessage]
      .filter(value => typeof value === 'string').join(' ');
    if (AUTH_MESSAGE.test(message)) return { signal: 'auth_expiry_message', evidence: `${entry.method || 'REQUEST'} ${path}: explicit auth-expiry response` };
  } catch { /* A truncated preview is not evidence of a logout. */ }
  return null;
}

async function inspectPage(page, perfMode = false) {
  return page.evaluate((selectors, collectPerf) => {
    const base = {
      origin: location.origin,
      path: location.pathname,
      login: location.pathname === '/' || location.pathname.includes('/login') ||
        selectors.loginIndicators.some(selector => !!document.querySelector(selector)),
      navigation: selectors.userIndicators.some(selector => !!document.querySelector(selector)),
      riskVisible: /验证码|异常登录|频繁操作|账号异常|安全验证|captcha|unusual activity/i.test(document.body?.innerText || ''),
    };
    if (!collectPerf) return base;
    // performance 模式：只读 Performance 条目（时间戳与 HTTP 状态），不接触响应正文。
    const nav = performance.getEntriesByType('navigation')[0];
    const perfRequests = performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('/rest/'))
      .map(entry => ({ url: entry.name, responseStatus: entry.responseStatus ?? null, startTime: entry.startTime }));
    return {
      ...base,
      perfNav: nav ? { type: nav.type, timeOrigin: nav.timeOrigin, redirectCount: nav.redirectCount } : null,
      perfRequests,
    };
  }, getSelectors(), perfMode);
}

function result(status, { lastNormalAt = null, firstAbnormalAt = null, pagePath = null, signal = 'none', verification = 'visible_page_only', evidence = 'No decisive authentication failure observed' } = {}) {
  return [{ status, lastNormalAt, firstAbnormalAt, pagePath, signal, verification, evidence }];
}

/** Observe only the bound Gllue tab and its own network traffic; never navigate or issue requests. */
export async function watchSession(page, args = {}) {
  const seconds = Number(args.seconds ?? 45);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) {
    throw new ArgumentError(`seconds must be an integer from 1 to ${MAX_SECONDS}`);
  }
  const mode = args.mode ?? 'capture';
  if (!MODES.has(mode)) {
    throw new ArgumentError(`mode must be one of: ${[...MODES].join(', ')}`);
  }
  const perfMode = mode === 'performance';
  const domain = getConfig().domain;
  const expectedOrigin = `https://${domain}`;
  const deadline = Date.now() + seconds * 1000;
  let lastNormalAt = null;
  let pagePath = null;
  let captureStarted = false;
  let networkObserved = false;
  let lastSiteRequest = null;
  let perfDocument = null;
  let perfWatermark = -1;

  try {
    while (true) {
      const state = await inspectPage(page, perfMode);
      const at = new Date().toISOString();
      pagePath = typeof state?.path === 'string' ? state.path.replace(/\d{3,}/g, ':id') : null;
      if (state?.origin !== expectedOrigin) {
        return result('unavailable', { pagePath, signal: 'wrong_or_missing_tab', verification: 'none', evidence: 'Bound tab is not the configured Gllue tenant; no navigation attempted' });
      }
      if (state.riskVisible) {
        return result('risk_prompt', { lastNormalAt, firstAbnormalAt: at, pagePath, signal: 'visible_risk_prompt', evidence: 'Visible verification or risk-control prompt' });
      }
      if (state.login) {
        return result(lastNormalAt ? 'logout_detected' : 'auth_required_observed', {
          lastNormalAt, firstAbnormalAt: at, pagePath,
          signal: lastNormalAt ? 'login_page_after_authenticated' : 'login_page_at_start',
          evidence: `Login page or password form visible in bound tab${lastSiteRequest ? `; last observed site request: ${lastSiteRequest}` : ''}`,
        });
      }
      if (state.navigation) lastNormalAt = at;

      if (perfMode) {
        // 新文档（整页重载/导航）后 Performance 缓冲重置，条目水位随之重置。
        if (state.perfNav && typeof state.perfNav.timeOrigin === 'number' && state.perfNav.timeOrigin !== perfDocument) {
          perfDocument = state.perfNav.timeOrigin;
          perfWatermark = -1;
        }
        for (const entry of Array.isArray(state.perfRequests) ? state.perfRequests : []) {
          if (typeof entry?.startTime !== 'number' || entry.startTime <= perfWatermark) continue;
          perfWatermark = Math.max(perfWatermark, entry.startTime);
          const path = safePath(entry?.url, domain);
          if (!path || !path.startsWith('/rest/')) continue;
          networkObserved = true;
          lastSiteRequest = `REQUEST ${path}: HTTP ${Number.isInteger(Number(entry.responseStatus)) ? Number(entry.responseStatus) : 'unknown'}`;
          const hit = authSignal(entry, domain);
          if (hit) {
            return result('auth_failure_signal', {
              lastNormalAt, firstAbnormalAt: new Date().toISOString(), pagePath,
              signal: hit.signal, verification: 'performance_entries_and_visible_page', evidence: hit.evidence,
            });
          }
        }
      }

      if (!perfMode && !captureStarted && typeof page.startNetworkCapture === 'function') {
        try { captureStarted = await page.startNetworkCapture(domain) === true; }
        catch { captureStarted = false; }
      }
      if (!perfMode && captureStarted && typeof page.readNetworkCapture === 'function') {
        const entries = await page.readNetworkCapture();
        for (const entry of Array.isArray(entries) ? entries : []) {
          const path = safePath(entry?.url, domain);
          if (!path || !path.startsWith('/rest/')) continue;
          networkObserved = true;
          lastSiteRequest = `${entry.method || 'REQUEST'} ${path}: HTTP ${Number.isInteger(Number(entry.responseStatus)) ? Number(entry.responseStatus) : 'unknown'}`;
          const hit = authSignal(entry, domain);
          if (hit) {
            return result('auth_failure_signal', {
              lastNormalAt, firstAbnormalAt: new Date().toISOString(), pagePath,
              signal: hit.signal, verification: 'passive_network_and_visible_page', evidence: hit.evidence,
            });
          }
        }
      }
      if (Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(SAMPLE_INTERVAL_MS, Math.max(0, deadline - Date.now()))));
    }
    const verification = networkObserved
      ? (perfMode ? 'performance_entries_and_visible_page' : 'passive_network_and_visible_page')
      : 'visible_page_only';
    return result('no_logout_signal', {
      lastNormalAt, pagePath, verification,
      evidence: networkObserved
        ? (perfMode
          ? 'No explicit auth failure in page performance entries; response bodies were not accessed, so backend-only expiry without a site request remains undetectable'
          : 'No explicit auth failure in captured site requests; backend-only expiry without a site request remains undetectable')
        : 'No decisive visible signal; no site request captured, so backend authentication was not verified',
    });
  } catch {
    return result('observer_error', { lastNormalAt, pagePath, signal: 'browser_bridge_error', verification: 'none', evidence: 'OpenCLI could not observe the bound tab; this is not evidence of Gllue logout' });
  }
}

cli({
  site: 'gllue',
  name: 'session-watch',
  description: '只读观察现有 Gllue 标签的登录、风控及页面自身请求异常；不刷新或主动探测',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  args: [
    { name: 'seconds', type: 'int', default: 45, description: '观察时长，1–50 秒' },
    { name: 'mode', type: 'string', default: 'capture', description: 'capture=被动网络捕获（扩展内暂存响应预览）；performance=仅页面 Performance 条目，不读响应正文' },
  ],
  columns: ['status', 'lastNormalAt', 'firstAbnormalAt', 'pagePath', 'signal', 'verification', 'evidence'],
  func: watchSession,
});
