import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-now',
  access: 'read',
  description: '检查当前标签页状态',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    var tabs = await page.tabs();
    console.log('当前 tabs:', JSON.stringify(tabs, null, 2));

    var url = await page.evaluate('window.location.href');
    var title = await page.evaluate('document.title');
    var vis = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);

    console.log('当前 page URL:', url);
    console.log('当前 page title:', title);
    console.log('页面状态:', JSON.stringify(vis));

    return { success: true };
  }
});
