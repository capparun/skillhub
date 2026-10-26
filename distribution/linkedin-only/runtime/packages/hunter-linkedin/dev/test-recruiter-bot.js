import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-bot',
  access: 'read',
  description: '检查浏览器指纹和页面状态',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 检查浏览器指纹 ===');
    var bot = await page.evaluate(`(function(){
      return {
        webdriver: navigator.webdriver,
        plugins: navigator.plugins.length,
        languages: navigator.languages,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        chrome: typeof window.chrome !== 'undefined',
        cdc: (function(){ for(var k in window) if(k.indexOf('cdc_')===0) return true; return false; })()
      };
    })()`);
    console.log('webdriver:', bot.webdriver);
    console.log('plugins:', bot.plugins);
    console.log('languages:', bot.languages);
    console.log('platform:', bot.platform);
    console.log('userAgent:', bot.userAgent.substring(0, 80));
    console.log('window.chrome:', bot.chrome);
    console.log('cdc_ present:', bot.cdc);

    console.log('\n=== 导航到搜索页 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    console.log('\n=== 检查页面错误 ===');
    var errors = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        hasResultsContainer: !!document.querySelector('#results-container'),
        bodyTextPreview: document.body.innerText.substring(0, 200),
        scripts: Array.from(document.querySelectorAll('script')).filter(s => s.src).map(s => s.src).slice(0, 5)
      };
    })()`);
    console.log('URL:', errors.url);
    console.log('Has results container:', errors.hasResultsContainer);
    console.log('Body preview:', errors.bodyTextPreview);
    console.log('Scripts:', errors.scripts);

    return { success: true };
  }
});
