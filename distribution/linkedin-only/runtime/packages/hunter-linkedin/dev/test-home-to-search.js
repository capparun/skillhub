import { cli, Strategy } from '@jackwener/opencli/registry';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-home-to-search',
  access: 'read',
  description: '从 talent/home 开始搜索',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 从 /talent/home 开始 ===');

    // 1. 先导航到 talent home
    console.log('\n导航到 /talent/home...');
    await page.goto('https://www.linkedin.com/talent/home', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(5000);

    var homeUrl = await page.evaluate('window.location.href');
    var homeTitle = await page.evaluate('document.title');
    console.log(`Home 页 URL: ${homeUrl}`);
    console.log(`Home 页 Title: ${homeTitle}`);

    // 2. 激活 Chrome
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 3000 });
    } catch(e) {}
    await sleep(2000);

    // 3. 检查是否有搜索框，尝试输入
    console.log('\n--- 查找搜索框 ---');
    var searchBoxInfo = await page.evaluate(`(function(){
      var inputs = Array.from(document.querySelectorAll('input'));
      var candidates = [];
      for(var i=0;i<inputs.length;i++){
        var placeholder = inputs[i].placeholder || '';
        var type = inputs[i].type;
        var visible = inputs[i].offsetWidth > 0 && inputs[i].offsetHeight > 0;
        if(visible && (type === 'text' || type === 'search')){
          candidates.push({
            placeholder: placeholder,
            id: inputs[i].id || '',
            class: inputs[i].className.substring(0,40),
            value: inputs[i].value || ''
          });
        }
      }
      return candidates.slice(0, 5);
    })()`);
    console.log('搜索框候选:', JSON.stringify(searchBoxInfo, null, 2));

    // 4. 尝试在主搜索框输入
    var hasSearchInput = searchBoxInfo.some(i => i.placeholder.toLowerCase().includes('search') || i.placeholder.toLowerCase().includes('job title'));

    if(hasSearchInput || searchBoxInfo.length > 0){
      console.log('\n--- 尝试在搜索框输入 ---');
      await page.evaluate(`(function(){
        var inputs = Array.from(document.querySelectorAll('input'));
        var target = null;
        for(var i=0;i<inputs.length;i++){
          var p = inputs[i].placeholder.toLowerCase();
          if(p.indexOf('search')>=0 || p.indexOf('job title')>=0 || p.indexOf('keyword')>=0){
            target = inputs[i];
            break;
          }
        }
        // 如果没找到，找第一个可见的 text input
        if(!target){
          for(var i=0;i<inputs.length;i++){
            if(inputs[i].type === 'text' && inputs[i].offsetWidth > 0){
              target = inputs[i];
              break;
            }
          }
        }
        if(target){
          target.focus();
          target.value = 'software engineer';
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
          return { inputted: true, placeholder: target.placeholder, id: target.id };
        }
        return { inputted: false };
      })()`);

      await sleep(5000);

      var afterInput = await page.evaluate('window.location.href');
      console.log('输入后 URL:', afterInput);
    }

    // 5. 如果还在 home 页，直接导航到搜索页
    var currentUrl = await page.evaluate('window.location.href');
    if(!currentUrl.includes('/talent/search')){
      console.log('\n--- 直接导航到搜索页 ---');
      await page.goto('https://www.linkedin.com/talent/search?searchBoolean=software+engineer&start=0', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await sleep(5000);
    }

    // 6. 检查最终状态
    var finalUrl = await page.evaluate('window.location.href');
    var finalTitle = await page.evaluate('document.title');
    var extraction = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0;
      var totalEl = document.querySelector('.profile-list__header-info-text');
      return { lockups: lockups, totalText: totalEl ? totalEl.textContent.trim() : '' };
    })()`);

    console.log('\n=== 最终状态 ===');
    console.log('URL:', finalUrl);
    console.log('Title:', finalTitle);
    console.log('提取结果:', JSON.stringify(extraction));

    // 7. 暂停 30 秒
    console.log('\n=== 暂停 30 秒，请确认页面状态 ===');
    for(let i = 0; i < 6; i++) {
      await sleep(5000);
      var url = await page.evaluate('window.location.href');
      var title = await page.evaluate('document.title');
      console.log(`[${(i+1)*5}s] URL: ${url.substring(0, 80)} | Title: ${title}`);
    }

    return { success: true };
  }
});
