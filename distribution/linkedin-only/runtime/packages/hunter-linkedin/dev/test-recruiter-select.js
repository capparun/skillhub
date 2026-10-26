import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-select',
  access: 'read',
  description: '测试 selectTab 切换后能否解除节流',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 当前 tabs ===');
    var tabs = await page.tabs();
    console.log(JSON.stringify(tabs, null, 2));

    // 创建新 tab
    console.log('\n=== 创建新 tab ===');
    await page.newTab('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0');
    await sleep(2000);

    var tabs2 = await page.tabs();
    console.log('创建后:', JSON.stringify(tabs2, null, 2));

    // 找到 talent search tab 的 index
    var talentTab = tabs2.find(t => t.url && t.url.includes('/talent/'));
    if(!talentTab){
      console.log('未找到 talent tab');
      return { success: false };
    }

    console.log('\n=== selectTab 到 talent tab (index=' + talentTab.index + ') ===');
    await page.selectTab(talentTab.index);
    console.log('selectTab 完成');
    await sleep(2000);

    // 检查当前 page 的 URL
    var url = await page.evaluate('window.location.href');
    console.log('当前 URL:', url);

    var vis = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);
    console.log('页面状态:', JSON.stringify(vis));

    // 等待加载
    console.log('\n等待 15s...');
    await sleep(15000);

    var state = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      var ghosts = container ? container.querySelectorAll('[data-test-ghost-row-entity-lockup-img]') : [];
      var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
      return {
        url: window.location.href,
        lockups: lockups.length,
        ghosts: ghosts.length,
        realCards: realCards.length
      };
    })()`);
    console.log('15s后:', JSON.stringify(state));

    return { success: true };
  }
});
