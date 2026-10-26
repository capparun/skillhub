import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-chrome-tabs',
  access: 'read',
  description: '测试 page.evaluate 中能否访问 chrome.tabs API',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    var r = await page.evaluate(`(function(){
      var results = {};
      // 检查 chrome API 是否可用
      if(typeof chrome !== 'undefined'){
        results.hasChrome = true;
        results.hasTabs = !!(chrome.tabs);
        results.hasRuntime = !!(chrome.runtime);
        results.hasWindows = !!(chrome.windows);
        if(chrome.runtime){
          results.runtimeId = chrome.runtime.id || 'no id';
        }
      } else {
        results.hasChrome = false;
      }
      // 检查是否有注入的脚本标记
      results.hasOpenCliMarker = !!document.querySelector('[data-opencli]');
      return results;
    })()`);
    console.log('chrome API 探测:', JSON.stringify(r, null, 2));

    return { success: true };
  }
});
