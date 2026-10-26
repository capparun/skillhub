import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-card-dom',
  access: 'read',
  description: '检查卡片内部 DOM 结构',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    // 激活 Chrome
    const { execSync } = await import('child_process');
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 3000 });
    } catch(e) {}
    await sleep(3000);

    var info = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      if(lockups.length === 0) return {error: 'no lockups'};

      var first = lockups[0];

      // 获取所有子元素的 class 和文本
      var children = [];
      var allEls = first.querySelectorAll('*');
      for(var i=0; i<Math.min(allEls.length, 30); i++){
        var el = allEls[i];
        var text = el.textContent.trim();
        if(text.length > 0 && text.length < 200){
          children.push({
            tag: el.tagName,
            class: el.className.substring(0, 60),
            text: text.substring(0, 100)
          });
        }
      }

      // 检查 headline 的原始 HTML
      var subtitleEl = first.querySelector('.artdeco-entity-lockup__subtitle');
      var subtitleHTML = subtitleEl ? subtitleEl.innerHTML.substring(0, 300) : '';
      var subtitleText = subtitleEl ? subtitleEl.textContent : '';

      // 检查是否有公司相关元素
      var companyEls = first.querySelectorAll('[data-test*="company"], [class*="company"], [class*="employer"]');
      var companyInfo = Array.from(companyEls).map(e => ({
        tag: e.tagName,
        class: e.className.substring(0, 50),
        text: e.textContent.trim().substring(0, 100)
      }));

      return {
        children: children.slice(0, 15),
        subtitleHTML: subtitleHTML,
        subtitleText: subtitleText.substring(0, 150),
        companyInfo: companyInfo
      };
    })()`);
    console.log('卡片结构:', JSON.stringify(info, null, 2));

    return { success: true };
  }
});
