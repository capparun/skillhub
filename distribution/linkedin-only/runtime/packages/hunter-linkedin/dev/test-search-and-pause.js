import { cli, Strategy } from '@jackwener/opencli/registry';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-search-and-pause',
  access: 'read',
  description: '搜索后暂停，验证页面是否保持在搜索页',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 开始测试：搜索后页面是否保持 ===');

    // 1. 记录初始 URL
    var initialUrl = await page.evaluate('window.location.href');
    console.log('初始 URL:', initialUrl);

    // 2. 导航到搜索页
    console.log('\n导航到 Recruiter 搜索页...');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(5000);

    var afterGoto = await page.evaluate('window.location.href');
    console.log('goto 后 URL:', afterGoto);

    // 3. 激活 Chrome
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 3000 });
    } catch(e) {}
    await sleep(2000);

    // 4. 检查标签页状态
    var tabState = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);
    console.log('标签页状态:', JSON.stringify(tabState));

    // 5. 提取卡片
    var extraction = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0;
      var totalEl = document.querySelector('.profile-list__header-info-text');
      return { lockups: lockups, totalText: totalEl ? totalEl.textContent.trim() : '' };
    })()`);
    console.log('提取结果:', JSON.stringify(extraction));

    // 6. 暂停 60 秒，保持页面
    console.log('\n=== 暂停 60 秒，请检查浏览器页面 ===');
    console.log('当前 URL:', afterGoto);
    console.log('如果你看到页面在搜索页，说明正常；如果跳回了 Feed，说明有问题。');

    for(let i = 0; i < 12; i++) {
      await sleep(5000);
      var currentUrl = await page.evaluate('window.location.href');
      var currentTitle = await page.evaluate('document.title');
      console.log(`[${(i+1)*5}s] URL: ${currentUrl.substring(0, 80)} | Title: ${currentTitle}`);
    }

    console.log('\n=== 测试结束 ===');
    return { success: true };
  }
});
