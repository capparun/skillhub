import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-pause',
  access: 'read',
  description: '输入搜索关键词后暂停，供用户查看页面状态',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 导航到 Recruiter 搜索页 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchKeyword=&start=0&uiOrigin=GLOBAL_SEARCH_HEADER', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);
    console.log('页面已加载');

    console.log(`\n=== 点击搜索框并输入 "${keyword}" ===`);
    await page.click('#system-search-typeahead');
    await sleep(300);

    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return 'not_found';
      el.focus();
      el.select();
      document.execCommand('insertText', false, ${JSON.stringify(keyword)});
      var ev = new Event('input', { bubbles: true });
      Object.defineProperty(ev, 'target', { value: el, enumerable: true });
      el.dispatchEvent(ev);
      return 'value: ' + el.value;
    })()`);
    console.log('输入完成');
    await sleep(1000);

    console.log('\n=== 发送 Enter ===');
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      ['keydown','keypress','keyup'].forEach(function(type){
        el.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
      });
    })()`);
    console.log('Enter 已发送');

    console.log('\n=== 等待 5 秒后检查状态 ===');
    await sleep(5000);

    const state = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        searchValue: (document.querySelector('#system-search-typeahead') || {}).value || '',
        hasStartSearch: document.body.innerText.indexOf('Start a search') >= 0,
        hasLoading: document.body.innerText.indexOf('Loading') >= 0,
        bodyPreview: document.body.innerText.substring(0, 300)
      };
    })()`);
    console.log('页面状态:', JSON.stringify(state, null, 2));

    console.log('\n=== 浏览器保持打开，请查看页面后按 Ctrl+C 结束 ===');
    // 保持运行 60 秒
    await sleep(60000);

    return { success: true };
  }
});
