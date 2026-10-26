import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-analyze',
  access: 'read',
  description: '触发搜索后等待结果加载，提取页面结构',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 导航 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchKeyword=&start=0&uiOrigin=GLOBAL_SEARCH_HEADER', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    console.log('\n=== 输入关键词并发送 Enter ===');
    await page.click('#system-search-typeahead');
    await sleep(300);
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if(!el) return;
      el.focus(); el.select();
      document.execCommand('insertText', false, ${JSON.stringify(keyword)});
      var ev = new Event('input', { bubbles: true });
      Object.defineProperty(ev, 'target', { value: el, enumerable: true });
      el.dispatchEvent(ev);
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

    // 循环等待加载完成
    console.log('\n=== 等待结果加载 ===');
    let rounds = 0;
    let state = null;
    while(rounds < 15){
      await sleep(3000);
      state = await page.evaluate(`(function(){
        var container = document.querySelector('#results-container');
        var b = document.body.innerText;
        return {
          url: window.location.href,
          hasStartSearch: b.indexOf('Start a search') >= 0,
          hasLoading: b.indexOf('Loading') >= 0,
          containerExists: !!container,
          containerHTML: container ? container.outerHTML.substring(0, 2000) : 'no container',
          lockupCount: container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0,
          allLinksCount: document.querySelectorAll('a').length,
          firstFewLinks: Array.from(document.querySelectorAll('a')).slice(0, 10).map(function(a){ return {href: (a.href||'').substring(0, 80), text: (a.textContent||'').trim().substring(0, 40)}; }),
          searchValue: (document.querySelector('#system-search-typeahead') || {}).value || '',
          paginationButtons: Array.from(document.querySelectorAll('button')).filter(function(b){ var t=(b.textContent||''); return /\d+/.test(t) || t.toLowerCase().indexOf('next')>=0 || t.toLowerCase().indexOf('previous')>=0; }).map(function(b){ return {text: (b.textContent||'').trim(), disabled: b.disabled}; }),
          totalResults: (b.match(/(\d+)\s+results?/) || b.match(/(\d+)\s+candidates?/) || [])[1] || ''
        };
      })()`);
      console.log(`[${rounds+1}] URL=${state.url.substring(0,60)} | StartSearch=${state.hasStartSearch} | Loading=${state.hasLoading} | Lockups=${state.lockupCount} | Links=${state.allLinksCount}`);
      if(!state.hasLoading && !state.hasStartSearch && state.lockupCount > 0){
        console.log('  结果已加载！');
        break;
      }
      rounds++;
    }

    console.log('\n=== 页面结构分析 ===');
    console.log(`URL: ${state.url}`);
    console.log(`#results-container 存在: ${state.containerExists}`);
    console.log(`artdeco-entity-lockup 数量: ${state.lockupCount}`);
    console.log(`总链接数: ${state.allLinksCount}`);
    console.log(`搜索结果数提示: ${state.totalResults || '未找到'}`);

    console.log('\n--- 前10个链接 ---');
    state.firstFewLinks.forEach((l, i) => console.log(`  ${i+1}. ${l.text.substring(0,30)} → ${l.href.substring(0,60)}`));

    console.log('\n--- 分页按钮 ---');
    if(state.paginationButtons.length > 0){
      state.paginationButtons.forEach((b, i) => console.log(`  ${i+1}. "${b.text}" disabled=${b.disabled}`));
    } else {
      console.log('  未找到分页按钮');
    }

    console.log('\n--- #results-container HTML 片段 ---');
    console.log(state.containerHTML.substring(0, 1500));

    // 保存完整 HTML 到文件
    const fullHTML = await page.evaluate(`(function(){ var c = document.querySelector('#results-container'); return c ? c.outerHTML : 'no container'; })()`);
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const outPath = path.join(os.homedir(), '.hunter', 'recruiter-page-analysis.html');
    fs.writeFileSync(outPath, fullHTML);
    console.log(`\n完整 HTML 已保存: ${outPath}`);

    return { success: true };
  }
});
