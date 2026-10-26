import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-api',
  access: 'read',
  description: '探测 LinkedIn Recruiter 暴露的全局 API 和搜索机制',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== Recruiter 全局 API 探测 ===\n');

    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    // 1. 扫描 window 上的 LinkedIn 相关全局变量
    console.log('--- 1. LinkedIn 全局变量 ---');
    const globals = await page.evaluate(`(function(){
      var keys = Object.keys(window);
      var linkedin = keys.filter(function(k){
        return k.toLowerCase().indexOf('linkedin') >= 0 ||
               k.toLowerCase().indexOf('li_') >= 0 ||
               k.toLowerCase().indexOf('talent') >= 0 ||
               k.toLowerCase().indexOf('recruiter') >= 0;
      });
      return linkedin.slice(0, 30);
    })()`);
    console.log(`LinkedIn 相关全局变量(${globals.length}个): ${JSON.stringify(globals)}`);

    // 2. 扫描所有含 search 的函数
    console.log('\n--- 2. window 上含 search 的方法 ---');
    const searchFns = await page.evaluate(`(function(){
      var keys = Object.keys(window);
      var fns = [];
      for(var i=0;i<keys.length;i++){
        try {
          if(typeof window[keys[i]] === 'function' && keys[i].toLowerCase().indexOf('search') >= 0){
            fns.push(keys[i]);
          }
        } catch(e) {}
      }
      return fns.slice(0, 20);
    })()`);
    console.log(`搜索相关方法: ${JSON.stringify(searchFns)}`);

    // 3. 检查是否有 Voyager API
    console.log('\n--- 3. Voyager API 检查 ---');
    const voyager = await page.evaluate(`(function(){
      return {
        hasVoyager: typeof window.voyager !== 'undefined',
        hasVoyagerClient: typeof window.VOYAGER_CLIENT !== 'undefined',
        hasLiAPi: typeof window.li !== 'undefined',
        hasIN: typeof window.IN !== 'undefined',
        hasLi: typeof window.li !== 'undefined'
      };
    })()`);
    console.log(`Voyager: ${JSON.stringify(voyager)}`);

    // 4. 检查事件监听器
    console.log('\n--- 4. 搜索框事件监听器 ---');
    const listeners = await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return {found: false};
      var clone = el.cloneNode(true);
      return {
        found: true,
        tagName: el.tagName,
        type: el.type,
        events: clone.onkeydown ? 'has onkeydown' : 'no onkeydown',
        parentTag: el.parentElement ? el.parentElement.tagName : 'none'
      };
    })()`);
    console.log(`搜索框: ${JSON.stringify(listeners)}`);

    // 5. 检查搜索框的父元素结构
    console.log('\n--- 5. 搜索框周围表单结构 ---');
    const formStructure = await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return {found: false};
      var parent = el.parentElement;
      var grandparent = parent ? parent.parentElement : null;
      var great = grandparent ? grandparent.parentElement : null;
      return {
        found: true,
        parent: parent ? {tag: parent.tagName, role: parent.getAttribute('role') || '', class: parent.className.substring(0, 50)} : null,
        grandparent: grandparent ? {tag: grandparent.tagName, role: grandparent.getAttribute('role') || '', class: grandparent.className.substring(0, 50)} : null,
        great: great ? {tag: great.tagName, class: great.className.substring(0, 50)} : null
      };
    })()`);
    console.log(`表单结构: ${JSON.stringify(formStructure)}`);

    // 6. 尝试用 click + 完整事件序列输入
    console.log('\n--- 6. click搜索框 + 逐字符输入 + 完整Enter事件 ---');
    await page.click('#system-search-typeahead');
    await sleep(500);

    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return 'not_found';
      el.focus();
      el.select();
      // 逐个字符输入，每个字符触发完整事件
      var text = 'engineer';
      for(var i=0;i<text.length;i++){
        var char = text[i];
        var before = el.value;
        el.value = before + char;
        el.dispatchEvent(new Event('input', { bubbles: true, data: char }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return 'typed: ' + el.value;
    })()`);
    await sleep(1000);

    // 完整 Enter 事件序列
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      // keydown
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      // keypress
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      // 触发 form submit（如果搜索框在 form 中）
      var form = el.closest('form');
      if(form){
        var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
        if(!submitEvent.defaultPrevented){
          // form.submit(); // 不要真提交，可能会跳转
        }
      }
      // keyup
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    })()`);
    await sleep(5000);

    const state6 = await page.evaluate(`(function(){
      var b = document.body.innerText;
      return {
        url: window.location.href,
        hasStartSearch: b.indexOf('Start a search') >= 0,
        hasLoading: b.indexOf('Loading') >= 0 || b.indexOf('loading') >= 0,
        searchValue: (document.querySelector('#system-search-typeahead') || {}).value || ''
      };
    })()`);
    console.log(`结果: ${JSON.stringify(state6)}`);

    // 7. 检查是否有 fetch 拦截或自定义事件
    console.log('\n--- 7. 检查搜索相关的自定义事件 ---');
    const customEvents = await page.evaluate(`(function(){
      var results = [];
      var el = document.querySelector('#system-search-typeahead');
      if(el){
        // 尝试获取事件监听器（如果浏览器支持）
        if(window.getEventListeners){
          var l = getEventListeners(el);
          results.push({element: 'searchTypeahead', listeners: Object.keys(l)});
        }
      }
      // 检查 document 上是否有自定义事件
      var allAttrs = [];
      var all = document.querySelectorAll('*');
      for(var i=0;i<Math.min(all.length, 50);i++){
        var onclick = all[i].getAttribute('onclick');
        if(onclick && onclick.indexOf('search') >= 0){
          allAttrs.push({tag: all[i].tagName, onclick: onclick.substring(0, 100)});
        }
      }
      return { hasGetEventListeners: !!window.getEventListeners, elementListeners: results, onclickSearch: allAttrs };
    })()`);
    console.log(`自定义事件: ${JSON.stringify(customEvents)}`);

    // 8. 尝试直接调用可能的内部函数
    console.log('\n--- 8. 尝试调用可能的搜索函数 ---');
    const searchAttempt = await page.evaluate(`(function(){
      var results = [];
      // 尝试常见的搜索函数名
      var names = ['search', 'doSearch', 'performSearch', 'executeSearch', 'triggerSearch', 'runSearch'];
      for(var i=0;i<names.length;i++){
        try {
          if(typeof window[names[i]] === 'function'){
            results.push({name: names[i], type: 'window function'});
          }
        } catch(e) {}
      }
      // 检查 IN 对象
      if(window.IN){
        var inKeys = Object.keys(window.IN).filter(function(k){ return k.toLowerCase().indexOf('search') >= 0; });
        results.push({IN_search_keys: inKeys});
      }
      return results;
    })()`);
    console.log(`搜索函数尝试: ${JSON.stringify(searchAttempt)}`);

    console.log('\n=== 探测完成 ===');
    return { success: true };
  }
});
