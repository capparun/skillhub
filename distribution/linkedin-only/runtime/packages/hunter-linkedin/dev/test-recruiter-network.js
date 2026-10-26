import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-network',
  access: 'read',
  description: '拦截网络请求，探测 Recruiter 搜索触发时的 API 调用',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 网络请求拦截探测 ===\n');

    // 在页面中注入网络拦截器
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    await page.evaluate(`(function(){
      window.__NETWORK_LOG__ = [];
      function log(req) {
        window.__NETWORK_LOG__.push(req);
        if (window.__NETWORK_LOG__.length > 200) window.__NETWORK_LOG__.shift();
      }

      // 拦截 fetch
      var origFetch = window.fetch;
      window.fetch = function() {
        var url = arguments[0];
        var opts = arguments[1] || {};
        log({ type: 'fetch', url: url, method: opts.method || 'GET', body: (opts.body || '').toString().substring(0, 500) });
        return origFetch.apply(this, arguments);
      };

      // 拦截 XHR
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._method = method;
        this._url = url;
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        log({ type: 'xhr', url: this._url, method: this._method, body: (body || '').toString().substring(0, 500) });
        return origSend.apply(this, arguments);
      };

      console.log('Network interceptor installed');
    })()`);
    console.log('网络拦截器已注入');

    // 清空日志
    await page.evaluate(`window.__NETWORK_LOG__ = []`);

    // === 测试1: 搜索框逐字符输入 + Enter ===
    console.log('\n--- 测试1: 搜索框输入 + Enter ---');
    await page.click('#system-search-typeahead');
    await sleep(300);

    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      el.focus();
      el.select();
      var text = 'engineer';
      for(var i=0;i<text.length;i++){
        var ch = text[i];
        el.value += ch;
        var ev = new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' });
        Object.defineProperty(ev, 'target', { value: el, enumerable: true });
        el.dispatchEvent(ev);
      }
      // Enter
      var kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      el.dispatchEvent(kd);
      var kp = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      el.dispatchEvent(kp);
      var ku = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      el.dispatchEvent(ku);
    })()`);
    await sleep(5000);

    let logs = await page.evaluate(`window.__NETWORK_LOG__`);
    console.log(`  请求数: ${logs.length}`);
    logs.forEach(l => console.log(`    [${l.type}] ${l.method} ${l.url.substring(0, 120)}`));

    // === 测试2: 加 Job titles facet ===
    console.log('\n--- 测试2: 加 Job titles facet ---');
    await page.evaluate(`window.__NETWORK_LOG__ = []`);
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    // 重新注入拦截器
    await page.evaluate(`(function(){
      window.__NETWORK_LOG__ = [];
      var origFetch = window.fetch;
      window.fetch = function() {
        var url = arguments[0];
        var opts = arguments[1] || {};
        window.__NETWORK_LOG__.push({ type: 'fetch', url: url, method: opts.method || 'GET', body: (opts.body || '').toString().substring(0, 500) });
        if (window.__NETWORK_LOG__.length > 200) window.__NETWORK_LOG__.shift();
        return origFetch.apply(this, arguments);
      };
    })()`);
    await page.evaluate(`(function(){ var btn = document.querySelector('.search-query-summary__edit-filters-btn'); if(btn) btn.click(); })()`);
    await sleep(2000);
    await page.evaluate(`(function(){ var all = Array.from(document.querySelectorAll('button')); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute('aria-label')||'').toLowerCase(); if(label.indexOf('job titles')>=0 && label.indexOf('add')>=0){ all[i].click(); return 'clicked'; } } return 'not_found'; })()`);
    await sleep(1500);
    await page.evaluate(`(function(){ var inputs = document.querySelectorAll('input[role=combobox], input[type=text]'); var t=null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value='Architect'; var ev = new InputEvent('input', { bubbles: true, data: 'Architect', inputType: 'insertText' }); Object.defineProperty(ev, 'target', { value: t, enumerable: true }); t.dispatchEvent(ev); } })()`);
    await sleep(3000);
    await page.evaluate(`(function(){ var opts = document.querySelectorAll('li[role=option]'); if(opts.length>0) opts[0].click(); })()`);
    await sleep(5000);

    logs = await page.evaluate(`window.__NETWORK_LOG__`);
    console.log(`  请求数: ${logs.length}`);
    logs.filter(l => l.url.includes('graphql') || l.url.includes('api')).forEach(l => console.log(`    [${l.type}] ${l.method} ${l.url.substring(0, 120)}`));

    // === 测试3: 尝试 InputEvent 输入搜索框 ===
    console.log('\n--- 测试3: InputEvent 输入搜索框 ---');
    await page.evaluate(`window.__NETWORK_LOG__ = []`);
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate(`(function(){
      window.__NETWORK_LOG__ = [];
      var origFetch = window.fetch;
      window.fetch = function() {
        var url = arguments[0];
        var opts = arguments[1] || {};
        window.__NETWORK_LOG__.push({ type: 'fetch', url: url, method: opts.method || 'GET', body: (opts.body || '').toString().substring(0, 500) });
        return origFetch.apply(this, arguments);
      };
    })()`);

    await page.click('#system-search-typeahead');
    await sleep(300);
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      // 使用 document.execCommand 插入文本
      el.focus();
      el.select();
      document.execCommand('insertText', false, 'software engineer');
    })()`);
    await sleep(1000);
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      ['keydown','keypress','keyup'].forEach(function(type){
        el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      });
    })()`);
    await sleep(5000);

    logs = await page.evaluate(`window.__NETWORK_LOG__`);
    console.log(`  请求数: ${logs.length}`);
    logs.filter(l => l.url.includes('graphql') || l.url.includes('api') || l.url.includes('search')).forEach(l => console.log(`    [${l.type}] ${l.method} ${l.url.substring(0, 120)}`));

    // === 测试4: 输出所有含 search/talent/graphql 的请求（去重）===
    console.log('\n--- 测试4: 所有搜索相关请求汇总 ---');
    const allLogs = await page.evaluate(`window.__NETWORK_LOG__`);
    const seen = new Set();
    allLogs.forEach(l => {
      if (l.url.includes('search') || l.url.includes('graphql') || l.url.includes('talent/api')) {
        const key = l.method + ' ' + l.url.split('?')[0];
        if (!seen.has(key)) {
          seen.add(key);
          console.log(`    [${l.type}] ${l.method} ${l.url.substring(0, 150)}`);
        }
      }
    });

    console.log('\n=== 探测完成 ===');
    return { success: true };
  }
});
