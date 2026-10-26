import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-errors',
  access: 'read',
  description: '检查 JS 错误和未完成的请求',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 导航到搜索页 ===');
    const searchUrl = 'https://www.linkedin.com/talent/search?searchBoolean=' + encodeURIComponent(keyword) + '&start=0';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    // 设置错误监听器
    await page.evaluate(`(function(){
      window._recruiterErrors = [];
      window.addEventListener('error', function(e){
        window._recruiterErrors.push({type:'error', msg:e.message, file:e.filename});
      });
      window.addEventListener('unhandledrejection', function(e){
        window._recruiterErrors.push({type:'rejection', msg:e.reason ? e.reason.toString() : 'unknown'});
      });
    })()`);

    console.log('\n=== 检查错误 ===');
    var errInfo = await page.evaluate(`(function(){
      return {
        errors: window._recruiterErrors || [],
        emberVersion: (window.Ember && window.Ember.VERSION) || 'no ember',
        liConfig: typeof window.linkedin !== 'undefined',
        liConfigKeys: window.linkedin ? Object.keys(window.linkedin).slice(0, 5) : []
      };
    })()`);
    console.log('Ember version:', errInfo.emberVersion);
    console.log('LinkedIn config:', errInfo.liConfig);
    console.log('Config keys:', errInfo.liConfigKeys);
    console.log('Errors:', JSON.stringify(errInfo.errors.slice(0, 10)));

    console.log('\n=== 检查未加载的图片和 iframe ===');
    var media = await page.evaluate(`(function(){
      var imgs = Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0);
      var iframes = Array.from(document.querySelectorAll('iframe'));
      return {
        incompleteImages: imgs.length,
        iframes: iframes.length
      };
    })()`);
    console.log('Incomplete images:', media.incompleteImages);
    console.log('Iframes:', media.iframes);

    return { success: true };
  }
});
