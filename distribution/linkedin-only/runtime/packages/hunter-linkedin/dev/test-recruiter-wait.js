import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-wait',
  access: 'read',
  description: 'bare URL + 长等待测试',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 导航到 bare URL ===');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(10000);

    var state = await page.evaluate(`(function(){
      var c = document.querySelector('#results-container');
      return {
        url: window.location.href,
        hasContainer: !!c,
        lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
        titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0
      };
    })()`);
    console.log('初始状态:', JSON.stringify(state));

    console.log('\n=== 点击搜索框并输入 ===');
    await page.click('#system-search-typeahead');
    await sleep(500);

    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return 'not_found';
      el.focus(); el.select();
      document.execCommand('insertText', false, ${JSON.stringify(keyword)});
      var ev = new Event('input', { bubbles: true });
      Object.defineProperty(ev, 'target', { value: el, enumerable: true });
      el.dispatchEvent(ev);
      return 'value: ' + el.value;
    })()`);
    await sleep(1000);

    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      ['keydown','keypress','keyup'].forEach(function(type){
        el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      });
    })()`);
    console.log('Enter 已发送');

    console.log('\n=== 循环等待 ===');
    for(var i=0; i<15; i++){
      await sleep(3000);
      state = await page.evaluate(`(function(){
        var c = document.querySelector('#results-container');
        return {
          url: window.location.href,
          hasContainer: !!c,
          lockups: c ? c.querySelectorAll('.artdeco-entity-lockup').length : 0,
          titles: c ? c.querySelectorAll('.artdeco-entity-lockup__title').length : 0,
          hasLoading: document.body.innerText.indexOf('Loading') >= 0
        };
      })()`);
      console.log(`[${i+1}] lockups=${state.lockups} titles=${state.titles} Loading=${state.hasLoading}`);
      if(state.titles > 0){
        console.log('内容已加载！');
        break;
      }
    }

    return { success: true };
  }
});
