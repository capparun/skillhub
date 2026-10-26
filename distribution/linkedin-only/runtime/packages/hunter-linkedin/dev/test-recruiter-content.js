import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-content',
  access: 'read',
  description: '检查 lockup 内部结构',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    // 检查 lockup 内部 HTML
    var info = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      if(lockups.length === 0) return {error: 'no lockups'};

      var first = lockups[0];
      return {
        count: lockups.length,
        innerHTML: first.innerHTML.substring(0, 800),
        textContent: first.textContent.trim().substring(0, 300),
        hasTitle: !!first.querySelector('.artdeco-entity-lockup__title'),
        hasSubtitle: !!first.querySelector('.artdeco-entity-lockup__subtitle'),
        titleText: first.querySelector('.artdeco-entity-lockup__title') ? first.querySelector('.artdeco-entity-lockup__title').textContent.trim().substring(0, 50) : '',
        subtitleText: first.querySelector('.artdeco-entity-lockup__subtitle') ? first.querySelector('.artdeco-entity-lockup__subtitle').textContent.trim().substring(0, 100) : ''
      };
    })()`);
    console.log('Lockup 信息:', JSON.stringify(info, null, 2));

    // 等更久再检查
    console.log('\n等待 30s...');
    await sleep(30000);

    var info2 = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      if(lockups.length === 0) return {error: 'no lockups'};

      var first = lockups[0];
      return {
        count: lockups.length,
        textContent: first.textContent.trim().substring(0, 300),
        titleText: first.querySelector('.artdeco-entity-lockup__title') ? first.querySelector('.artdeco-entity-lockup__title').textContent.trim().substring(0, 50) : '',
        subtitleText: first.querySelector('.artdeco-entity-lockup__subtitle') ? first.querySelector('.artdeco-entity-lockup__subtitle').textContent.trim().substring(0, 100) : ''
      };
    })()`);
    console.log('30s后:', JSON.stringify(info2, null, 2));

    return { success: true };
  }
});
