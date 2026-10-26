import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-stay',
  access: 'read',
  description: '访问 talent/home 后暂停 2 分钟，验证页面是否保持',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('导航到 /talent/home...');
    await page.goto('https://www.linkedin.com/talent/home', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(5000);

    var state = await page.evaluate(`(function(){
      return { url: window.location.href, title: document.title };
    })()`);
    console.log('当前状态:', JSON.stringify(state));

    console.log('\n=== 暂停 120 秒 ===');
    console.log('请盯着浏览器窗口，看页面是否会自动跳回 Feed');

    for(let i = 0; i < 24; i++) {
      await sleep(5000);
      var s = await page.evaluate(`(function(){
        return { url: window.location.href, title: document.title };
      })()`);
      console.log(`[${(i+1)*5}s] ${s.title} | ${s.url.substring(0, 60)}`);
    }

    console.log('\n测试结束');
    return { success: true };
  }
});
