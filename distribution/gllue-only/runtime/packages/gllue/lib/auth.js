import { loadConfig } from './utils.js';

let cachedConfig = null;

/**
 * 获取配置（带缓存）
 */
export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * 构建完整 URL
 */
export function buildUrl(config, pathname = '') {
  const base = `${config.protocol}://${config.domain}`;
  return pathname ? `${base}${pathname}` : base;
}

/**
 * 打开 Gllue 页面
 */
export async function openGlluePage(page, pathname) {
  const config = getConfig();
  const url = buildUrl(config, pathname);
  await page.goto(url, { waitUntil: 'networkidle2' });
  return url;
}

/**
 * 检查当前是否处于登录态
 * 通过判断页面 URL 或关键元素实现
 */
export async function isLoggedIn(page) {
  const config = getConfig();
  const requestedUrl = await page.getCurrentUrl?.() || '';
  // Browser bridge may retain the requested URL after the site redirects to login.
  // Prefer the URL observed inside the page; synthetic/legacy wrappers that cannot
  // return it fall back to getCurrentUrl.
  let observedUrl = '';
  try {
    const observed = await page.evaluate(() => location.href);
    if (typeof observed === 'string') observedUrl = observed;
  } catch { /* fall back below */ }
  const url = observedUrl || requestedUrl;
  const baseUrl = buildUrl(config);
  let current;
  try { current = new URL(url); } catch { return false; }
  if (current.origin !== new URL(baseUrl).origin) return false;

  // Gllue 登录页为 /，登录后进入 /crm/* 路径
  if (current.pathname === '/') {
    return false;
  }
  if (current.pathname.includes('/login')) return false;

  let state;
  try {
    state = await page.evaluate((selectors) => {
      for (const sel of selectors.loginIndicators) {
        if (document.querySelector(sel)) return { loggedIn: false, reason: 'login-form-found' };
      }
      for (const sel of selectors.userIndicators) {
        if (document.querySelector(sel)) return { loggedIn: true, reason: 'user-indicator-found' };
      }
      return { loggedIn: false, reason: 'no-indicator' };
    }, getSelectors());
  } catch { return false; }
  if (typeof state?.loggedIn === 'boolean') return state.loggedIn;
  return false;
}

/**
 * 等待登录完成
 */
export async function waitForLogin(page, timeout = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isLoggedIn(page)) {
      return true;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('等待登录超时，请检查浏览器是否已完成登录');
}

/**
 * 获取选择器配置
 */
export function getSelectors() {
  return {
    userIndicators: [
      '[data-test="navigation-action$avatar"]',
      '[data-test="navigation$dashboard"]',
      '#nav_base',
      '.ant-layout-sider',
      '.gllue-nav'
    ],
    loginIndicators: [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="密码"]',
      'form[action*="login"]',
      '.login-form',
      '.gllue-login'
    ]
  };
}
