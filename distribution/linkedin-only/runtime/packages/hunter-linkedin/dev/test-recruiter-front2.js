import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-front2',
  access: 'read',
  description: '通过 _page 访问底层 bringToFront',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('page._page:', typeof page._page);
    if(page._page){
      console.log('page._page keys:', Object.keys(page._page).slice(0, 20));
      console.log('page._page.bringToFront:', typeof page._page.bringToFront);
    }

    if(page._page && typeof page._page.bringToFront === 'function'){
      console.log('\n=== 通过 _page 调用 bringToFront ===');
      await page._page.bringToFront();
      console.log('完成');
    }

    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

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
