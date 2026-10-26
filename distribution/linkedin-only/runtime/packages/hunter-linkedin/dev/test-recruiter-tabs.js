import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-tabs',
  access: 'read',
  description: '测试 opencli 的 tab 管理 API',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 测试 tab API ===');

    // 检查 tab API 是否可用
    console.log('tabs:', typeof page.tabs);
    console.log('newTab:', typeof page.newTab);
    console.log('selectTab:', typeof page.selectTab);
    console.log('closeTab:', typeof page.closeTab);

    // 获取当前所有 tabs
    if(typeof page.tabs === 'function'){
      var tabs = await page.tabs();
      console.log('当前 tabs:', JSON.stringify(tabs, null, 2));
    }

    // 尝试创建新 tab
    if(typeof page.newTab === 'function'){
      console.log('\n=== 创建新 tab ===');
      var newTabId = await page.newTab('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0');
      console.log('新 tab ID:', newTabId);
      await sleep(3000);

      // 检查新 tab 的状态
      var tabs2 = await page.tabs();
      console.log('创建后 tabs:', JSON.stringify(tabs2, null, 2));

      // 检查新 tab 的 visibilityState
      var vis = await page.evaluate(`(function(){
        return { hidden: document.hidden, visibilityState: document.visibilityState };
      })()`);
      console.log('新 tab 状态:', JSON.stringify(vis));

      await sleep(10000);

      // 检查结果
      var state = await page.evaluate(`(function(){
        var container = document.querySelector('#results-container');
        var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
        var ghosts = container ? container.querySelectorAll('[data-test-ghost-row-entity-lockup-img]') : [];
        var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
        return {
          lockups: lockups.length,
          ghosts: ghosts.length,
          realCards: realCards.length
        };
      })()`);
      console.log('10s后:', JSON.stringify(state));
    }

    return { success: true };
  }
});
