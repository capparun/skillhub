import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-scroll',
  access: 'read',
  description: '测试不同滚动方式对懒加载的影响',
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

    // 初始状态
    var state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
        links: c ? c.querySelectorAll('a').length : 0
      };
    })()`);
    console.log('初始: lockups=' + state.lockups + ', titles=' + state.titles + ', links=' + state.links);

    // 方法1: window.scrollBy
    console.log('\n方法1: window.scrollBy(0, 1500)');
    await page.evaluate('window.scrollBy(0, 1500)');
    await sleep(4000);
    state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
        links: c ? c.querySelectorAll('a').length : 0
      };
    })()`);
    console.log('  结果: lockups=' + state.lockups + ', titles=' + state.titles + ', links=' + state.links);

    // 方法2: 滚动到底部
    console.log('\n方法2: 滚动到底部');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await sleep(4000);
    state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
        links: c ? c.querySelectorAll('a').length : 0
      };
    })()`);
    console.log('  结果: lockups=' + state.lockups + ', titles=' + state.titles + ', links=' + state.links);

    // 方法3: 点击第一个 lockup 强制聚焦
    console.log('\n方法3: 点击第一个 lockup');
    await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      if(c){
        var l = c.querySelector('.artdeco-entity-lockup');
        if(l) l.click();
      }
    })()`);
    await sleep(4000);
    state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
        links: c ? c.querySelectorAll('a').length : 0
      };
    })()`);
    console.log('  结果: lockups=' + state.lockups + ', titles=' + state.titles + ', links=' + state.links);

    // 方法4: 等待更长时间
    console.log('\n方法4: 等待 15 秒');
    await sleep(15000);
    state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
        links: c ? c.querySelectorAll('a').length : 0
      };
    })()`);
    console.log('  结果: lockups=' + state.lockups + ', titles=' + state.titles + ', links=' + state.links);

    return { success: true };
  }
});
