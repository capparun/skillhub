import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-facet-trigger',
  access: 'read',
  description: '诊断 facet 选择后的触发机制',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 导航到搜索页 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    // 先检查初始状态
    var before = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
        lockups: document.querySelectorAll('.artdeco-entity-lockup').length
      };
    })()`);
    console.log('初始状态 - URL:', before.url);
    console.log('初始状态 - Pills:', before.pills);

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
    await sleep(3000);

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
    await sleep(2000);

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
      return {found: true, id: target.id, className: target.className};
    })()`);
    await sleep(8000);

    // 检查选项的 HTML 结构
    console.log('\n=== 检查选项结构 ===');
    var optionStruct = await page.evaluate(`(function(){
      var opts = document.querySelectorAll('li[role=option]');
      if(opts.length === 0) return {count: 0};
      var first = opts[0];
      return {
        count: opts.length,
        outerHTML: first.outerHTML.substring(0, 300),
        innerHTML: first.innerHTML.substring(0, 300),
        children: Array.from(first.children).map(c => c.tagName + (c.className ? '.'+c.className.substring(0,40) : '')),
        hasButton: !!first.querySelector('button'),
        clickable: first.querySelector('button') ? first.querySelector('button').outerHTML.substring(0, 200) : null
      };
    })()`);
    console.log('选项结构:', JSON.stringify(optionStruct, null, 2));

    console.log('\n=== 点击第一个选项 ===');
    await page.evaluate(`(function(){
      var opts = document.querySelectorAll('li[role=option]');
      if(opts.length>0){
        // 优先点击内部的 button
        var btn = opts[0].querySelector('button');
        if(btn){
          btn.click();
          return {clicked: 'inner-button'};
        }
        opts[0].click();
        return {clicked: 'li'};
      }
      return {clicked: false};
    })()`);

    // 立即检查一次
    await sleep(500);
    var immediate = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
        lockups: document.querySelectorAll('.artdeco-entity-lockup').length
      };
    })()`);
    console.log('点击后 0.5s - URL:', immediate.url);
    console.log('点击后 0.5s - Pills:', immediate.pills);

    // 等待并持续监控
    console.log('\n=== 持续监控 20s ===');
    for(let i=0; i<10; i++){
      await sleep(2000);
      var state = await page.evaluate(`(function(){
        // 找所有可能的触发按钮
        var allBtns = Array.from(document.querySelectorAll('button'));
        var triggers = allBtns.filter(b => {
          var text = (b.textContent || '').trim().toLowerCase();
          return text.indexOf('show results')>=0 || text.indexOf('apply')>=0 ||
                 text.indexOf('done')>=0 || text.indexOf('save')>=0 ||
                 text.indexOf('search')>=0;
        }).map(b => ({
          text: b.textContent.trim().substring(0, 40),
          className: b.className.substring(0, 60),
          visible: b.offsetParent !== null
        }));

        // 找 facet 面板底部
        var panel = document.querySelector('.facets-container, .search-facets, [data-test-facet-panel]');
        var panelFooter = panel ? panel.querySelector('.artdeco-button, button') : null;

        return {
          url: window.location.href,
          pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
          lockups: document.querySelectorAll('.artdeco-entity-lockup').length,
          triggers: triggers.slice(0, 5),
          panelFound: !!panel
        };
      })()`);
      console.log(`  ${(i+1)*2}s - pills=${state.pills.length}, lockups=${state.lockups}, triggers=${JSON.stringify(state.triggers)}`);
    }

    // 尝试按 Escape
    console.log('\n=== 尝试按 Escape ===');
    await page.keyboard.press('Escape');
    await sleep(3000);

    var afterEsc = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
        lockups: document.querySelectorAll('.artdeco-entity-lockup').length
      };
    })()`);
    console.log('Escape后 - URL:', afterEsc.url);
    console.log('Escape后 - Pills:', afterEsc.pills);

    return { success: true };
  }
});
