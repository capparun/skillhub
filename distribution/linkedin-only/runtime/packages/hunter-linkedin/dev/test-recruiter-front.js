import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-front',
  access: 'read',
  description: '测试 bringToFront 是否能解决节流',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('page keys:', Object.keys(page).slice(0, 20));
    console.log('page.bringToFront:', typeof page.bringToFront);
    console.log('page.evaluate:', typeof page.evaluate);
    console.log('page.goto:', typeof page.goto);
    console.log('page.click:', typeof page.click);

    if(typeof page.bringToFront === 'function'){
      console.log('\n=== 调用 bringToFront ===');
      await page.bringToFront();
      console.log('bringToFront 完成');
    }

    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // 检查 visibilityState
    var vis = await page.evaluate(`(function(){
      return {
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus()
      };
    })()`);
    console.log('页面状态:', JSON.stringify(vis));

    console.log('\n等待 15s...');
    await sleep(15000);

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
    console.log('15s后:', JSON.stringify(state));

    return { success: true };
  }
});
