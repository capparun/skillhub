import { cli, Strategy } from '@jackwener/opencli/registry';
import { getConfig, buildUrl, isLoggedIn } from './lib/auth.js';

/**
 * 测试与 Gllue 的连接和登录态
 */
cli({
  site: 'gllue',
  name: 'test-connection',
  description: '测试 Gllue 连接与登录态',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [],
  columns: ['status', 'domain', 'loggedIn', 'verification', 'message'],
  func: async (page) => {
    const config = getConfig();
    const url = buildUrl(config, config.paths.dashboard);

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      const loggedIn = await isLoggedIn(page);

      return {
        status: loggedIn ? 'ok' : 'auth_required',
        domain: config.domain,
        loggedIn,
        verification: loggedIn ? 'visible_page_only' : 'none',
        message: loggedIn
          ? 'Gllue 页面显示已登录；后台业务请求未验证'
          : '未登录 Gllue，请先运行 opencli gllue login'
      };
    } catch (err) {
      return {
        status: 'error',
        domain: config.domain,
        loggedIn: false,
        verification: 'none',
        message: err.message
      };
    }
  }
});
