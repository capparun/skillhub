import { cli, Strategy } from '@jackwener/opencli/registry';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-activate',
  access: 'read',
  description: '导航后激活 Chrome 窗口，测试是否能解除 hidden',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1000);

    console.log('导航完成，检查初始状态...');
    var s1 = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState, url: window.location.href };
    })()`);
    console.log('初始:', JSON.stringify(s1));

    // 用 AppleScript 激活 Chrome
    console.log('激活 Chrome 窗口...');
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 5000 });
    } catch(e) {
      console.log('激活失败:', e.message);
    }

    // 等待 Chrome 获得焦点
    console.log('等待 5s...');
    await sleep(5000);

    var s2 = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);
    console.log('激活后:', JSON.stringify(s2));

    // 再激活一次，等更久
    console.log('再次激活，等 15s...');
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 5000 });
    } catch(e) {}
    await sleep(15000);

    var s3 = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);
    console.log('15s后:', JSON.stringify(s3));

    // 检查结果加载情况
    var cards = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      var ghosts = container ? container.querySelectorAll('[data-test-ghost-row-entity-lockup-img]') : [];
      var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
      return { lockups: lockups.length, ghosts: ghosts.length, realCards: realCards.length };
    })()`);
    console.log('卡片状态:', JSON.stringify(cards));

    return { success: true };
  }
});
