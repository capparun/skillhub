import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-facet-flow',
  access: 'read',
  description: '观察 facet 添加的完整流程',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 导航到搜索页 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    console.log('\n=== 点击 Show filters ===');
    await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<all.length;i++){
        var text = (all[i].textContent || '').trim().toLowerCase();
        if(text.indexOf('show filters')>=0){
          all[i].click();
          return {clicked: true, text: text};
        }
      }
      return {clicked: false};
    })()`);
    await sleep(2000);

    console.log('\n=== 点击 Job Titles 的 Add ===');
    await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<all.length;i++){
        var aria = (all[i].getAttribute('aria-label') || '').toLowerCase();
        if(aria.indexOf('job titles')>=0 && aria.indexOf('add')>=0){
          all[i].click();
          return {clicked: true, aria: aria};
        }
      }
      return {clicked: false};
    })()`);
    await sleep(1500);

    console.log('\n=== 输入 Software Engineer ===');
    await page.evaluate(`(function(){
      var inputs = document.querySelectorAll('input[role=combobox], input[type=text]');
      var target = null;
      for(var i=inputs.length-1;i>=0;i--){
        if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){
          target = inputs[i];
          break;
        }
      }
      if(!target) return {found: false};
      target.focus();
      target.value = 'Software Engineer';
      var ev = new Event('input', { bubbles: true });
      Object.defineProperty(ev, 'target', { value: target, enumerable: true });
      target.dispatchEvent(ev);
      return {found: true};
    })()`);
    await sleep(8000);

    console.log('\n=== 检查下拉选项 ===');
    var opts = await page.evaluate(`(function(){
      var opts = document.querySelectorAll('li[role=option]');
      return {
        count: opts.length,
        texts: Array.from(opts).slice(0, 5).map(o => o.textContent.trim())
      };
    })()`);
    console.log('Options:', opts.count, opts.texts);

    if(opts.count > 0){
      console.log('\n=== 点击第一个选项 ===');
      await page.evaluate(`(function(){
        var opts = document.querySelectorAll('li[role=option]');
        if(opts.length>0) opts[0].click();
      })()`);
      await sleep(2000);
    }

    console.log('\n=== 检查所有按钮文本（找触发按钮）===');
    var allBtnTexts = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent.trim().substring(0, 50),
        aria: (b.getAttribute('aria-label') || '').substring(0, 50)
      })).filter(b => b.text || b.aria);
    })()`);
    allBtnTexts.slice(0, 30).forEach(b => console.log('  text="' + b.text + '" aria="' + b.aria + '"'));

    console.log('\n=== 尝试点击页面空白区域关闭面板 ===');
    await page.evaluate(`(function(){
      var results = document.querySelector('#results-container');
      if(results) results.click();
    })()`);
    await sleep(5000);

    var state = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
        totalText: (document.querySelector('.profile-list__header-info-text') || {}).textContent || '',
        lockups: document.querySelectorAll('.artdeco-entity-lockup').length
      };
    })()`);
    console.log('After click outside - URL:', state.url);
    console.log('After click outside - Pills:', state.pills);

    if(state.pills.length === 0){
      console.log('\n=== 尝试重新点击搜索框触发搜索 ===');
      await page.click('#system-search-typeahead');
      await sleep(500);
      await page.evaluate(`(function(){
        var el = document.querySelector('#system-search-typeahead');
        if(el){
          ['keydown','keypress','keyup'].forEach(function(type){
            el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          });
        }
      })()`);
      await sleep(10000);

      state = await page.evaluate(`(function(){
        return {
          url: window.location.href,
          pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
          totalText: (document.querySelector('.profile-list__header-info-text') || {}).textContent || '',
          lockups: document.querySelectorAll('.artdeco-entity-lockup').length
        };
      })()`);
      console.log('After Enter - URL:', state.url);
      console.log('After Enter - Pills:', state.pills);
    }

    return { success: true };
  }
});
