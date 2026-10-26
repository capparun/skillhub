import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-ember',
  access: 'read',
  description: '诊断 Ember.js 加载问题',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 导航到搜索页 ===');
    const searchUrl = 'https://www.linkedin.com/talent/search?searchBoolean=' + encodeURIComponent(keyword) + '&start=0';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    console.log('\n=== 检查 JS 加载状态 ===');
    var jsState = await page.evaluate(`(function(){
      var scripts = Array.from(document.querySelectorAll('script[src]'));
      var emberScripts = scripts.filter(s => s.src.indexOf('ember') >= 0 || s.src.indexOf('talent-web') >= 0 || s.src.indexOf('chunks') >= 0);
      return {
        totalScripts: scripts.length,
        emberScripts: emberScripts.map(s => s.src.substring(0, 100)),
        hasEmber: typeof Ember !== 'undefined',
        hasApp: typeof App !== 'undefined',
        hasLinkedIn: typeof linkedin !== 'undefined',
        documentReadyState: document.readyState,
        windowKeys: Object.keys(window).filter(k => k.indexOf('Ember') >= 0 || k.indexOf('APP') >= 0 || k.indexOf('linkedin') >= 0)
      };
    })()`);
    console.log('Total scripts:', jsState.totalScripts);
    console.log('Ember scripts:', jsState.emberScripts.length);
    jsState.emberScripts.forEach(s => console.log('  ', s));
    console.log('Has Ember:', jsState.hasEmber);
    console.log('Has App:', jsState.hasApp);
    console.log('Has LinkedIn:', jsState.hasLinkedIn);
    console.log('Ready state:', jsState.documentReadyState);
    console.log('Window keys:', jsState.windowKeys);

    console.log('\n=== 等待 20 秒后再次检查 ===');
    await sleep(20000);

    jsState = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      var lockups = c ? c.querySelectorAll('.artdeco-entity-lockup') : [];
      var firstLockup = lockups[0];
      return {
        hasEmber: typeof Ember !== 'undefined',
        hasApp: typeof App !== 'undefined',
        lockups: lockups.length,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
        titleLinks: c ? c.querySelectorAll('.artdeco-entity-lockup__title a').length : 0,
        firstLockupHTML: firstLockup ? firstLockup.outerHTML.substring(0, 600) : 'none',
        readyState: document.readyState
      };
    })()`);
    console.log('20秒后:');
    console.log('  Has Ember:', jsState.hasEmber);
    console.log('  Has App:', jsState.hasApp);
    console.log('  Lockups:', jsState.lockups);
    console.log('  Titles:', jsState.titles);
    console.log('  Title links:', jsState.titleLinks);
    console.log('  First lockup HTML:', jsState.firstLockupHTML);

    return { success: true };
  }
});
