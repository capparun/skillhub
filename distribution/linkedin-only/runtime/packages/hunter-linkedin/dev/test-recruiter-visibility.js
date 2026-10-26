import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-visibility',
  access: 'read',
  description: '检查页面可见性和焦点状态',
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

    var state = await page.evaluate(`(function(){
      return {
        visibilityState: document.visibilityState,
        hidden: document.hidden,
        hasFocus: document.hasFocus()
      };
    })()`);
    console.log('初始状态:', JSON.stringify(state));

    console.log('\n=== 覆盖 visibilityState ===');
    await page.evaluate(`(function(){
      Object.defineProperty(document, 'hidden', { value: false, writable: false });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });
      document.dispatchEvent(new Event('visibilitychange'));
      return {
        visibilityState: document.visibilityState,
        hidden: document.hidden
      };
    })()`);
    await sleep(2000);

    state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        visibilityState: document.visibilityState,
        hidden: document.hidden,
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0
      };
    })()`);
    console.log('覆盖后:', JSON.stringify(state));

    if(state.titles === 0){
      console.log('\n=== 等待 + 滚动 ===');
      await sleep(5000);
      await page.evaluate('window.scrollBy(0, 1500)');
      await sleep(5000);

      state = await page.evaluate(`(function(){
        var c = document.querySelector('#results-container');
        return {
          lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
          titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0
        };
      })()`);
      console.log('滚动后:', JSON.stringify(state));
    }

    return { success: true };
  }
});
