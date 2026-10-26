import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-facet-ember',
  access: 'read',
  description: '用多种方式尝试触发 facet 选择',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 导航到搜索页 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    console.log('\n=== 打开 facet 面板 ===');
    await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<all.length;i++){
        var text = (all[i].textContent || '').trim().toLowerCase();
        if(text.indexOf('show filters')>=0){
          all[i].click();
          return {clicked: true};
        }
      }
      return {clicked: false};
    })()`);
    await sleep(3000);

    console.log('\n=== 打开 Job Titles ===');
    await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<all.length;i++){
        var aria = (all[i].getAttribute('aria-label') || '').toLowerCase();
        if(aria.indexOf('job titles')>=0 && aria.indexOf('add')>=0){
          all[i].click();
          return {clicked: true};
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
      return {found: true};
    })()`);
    await sleep(8000);

    // 方法1: 完整鼠标事件序列
    console.log('\n=== 方法1: 完整鼠标事件序列 ===');
    var r1 = await page.evaluate(`(function(){
      var opt = document.querySelector('li[role=option]');
      if(!opt) return {error: 'no option'};

      function dispatch(type, opts){
        var ev = new MouseEvent(type, Object.assign({
          bubbles: true, cancelable: true, view: window,
          button: 0, buttons: 1, clientX: 0, clientY: 0
        }, opts || {}));
        opt.dispatchEvent(ev);
      }

      dispatch('mousedown');
      dispatch('mouseup');
      dispatch('click');

      return {ariaSelected: opt.getAttribute('aria-selected'), clicked: true};
    })()`);
    console.log('方法1结果:', JSON.stringify(r1));
    await sleep(5000);

    // 检查状态
    var s1 = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
        lockups: document.querySelectorAll('.artdeco-entity-lockup').length
      };
    })()`);
    console.log('方法1后状态:', JSON.stringify(s1));

    // 如果没生效，刷新重来试方法2
    if(s1.pills.length === 0){
      console.log('\n=== 刷新页面，尝试方法2: Ember 直接访问 ===');
      await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(8000);

      await page.evaluate(`(function(){
        var all = Array.from(document.querySelectorAll('button'));
        for(var i=0;i<all.length;i++){
          var text = (all[i].textContent || '').trim().toLowerCase();
          if(text.indexOf('show filters')>=0){ all[i].click(); break; }
        }
      })()`);
      await sleep(3000);

      await page.evaluate(`(function(){
        var all = Array.from(document.querySelectorAll('button'));
        for(var i=0;i<all.length;i++){
          var aria = (all[i].getAttribute('aria-label') || '').toLowerCase();
          if(aria.indexOf('job titles')>=0 && aria.indexOf('add')>=0){ all[i].click(); break; }
        }
      })()`);
      await sleep(2000);

      await page.evaluate(`(function(){
        var inputs = document.querySelectorAll('input[role=combobox], input[type=text]');
        var target = null;
        for(var i=inputs.length-1;i>=0;i--){
          if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ target = inputs[i]; break; }
        }
        if(target){
          target.focus();
          target.value = 'Software Engineer';
          var ev = new Event('input', { bubbles: true });
          Object.defineProperty(ev, 'target', { value: target, enumerable: true });
          target.dispatchEvent(ev);
        }
      })()`);
      await sleep(8000);

      console.log('\n=== 方法2: 尝试 Ember 组件直接访问 ===');
      var r2 = await page.evaluate(`(function(){
        var opt = document.querySelector('li[role=option]');
        if(!opt) return {error: 'no option'};

        // 尝试通过 Ember 内部访问
        var emberMeta = Object.keys(opt).find(k => k.indexOf('__ember') >= 0);
        var component = emberMeta ? opt[emberMeta] : null;

        // 也尝试 window.Ember
        var Ember = window.Ember;

        return {
          emberMeta: emberMeta,
          hasComponent: !!component,
          hasEmber: !!Ember,
          componentKeys: component ? Object.keys(component).slice(0, 10) : [],
          optHTML: opt.outerHTML.substring(0, 200)
        };
      })()`);
      console.log('Ember探测:', JSON.stringify(r2, null, 2));

      // 方法3: 找 option 内部的 checkbox/span 点击
      console.log('\n=== 方法3: 点击 option 内部元素 ===');
      var r3 = await page.evaluate(`(function(){
        var opt = document.querySelector('li[role=option]');
        if(!opt) return {error: 'no option'};

        // 找内部可点击元素
        var inner = opt.querySelector('span, div, input');
        if(inner){
          inner.click();
          return {clicked: inner.tagName, className: inner.className};
        }
        opt.click();
        return {clicked: 'li'};
      })()`);
      console.log('方法3:', JSON.stringify(r3));
      await sleep(5000);

      var s3 = await page.evaluate(`(function(){
        return {
          url: window.location.href,
          pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
          lockups: document.querySelectorAll('.artdeco-entity-lockup').length
        };
      })()`);
      console.log('方法3后状态:', JSON.stringify(s3));
    }

    return { success: true };
  }
});
