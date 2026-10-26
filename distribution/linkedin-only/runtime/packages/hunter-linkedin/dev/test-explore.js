import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'hunter-linkedin',
  name: 'test-explore',
  access: 'read',
  description: '探索浏览器状态：标签页、窗口、连接信息',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 浏览器状态探索 ===\n');

    // 1. 当前标签页信息
    console.log('--- 当前标签页 ---');
    var current = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        title: document.title,
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        readyState: document.readyState
      };
    })()`);
    console.log(JSON.stringify(current, null, 2));

    // 2. 所有标签页
    console.log('\n--- 所有标签页 ---');
    try {
      var tabs = await page.tabs();
      console.log(JSON.stringify(tabs, null, 2));
    } catch(e) {
      console.log('tabs() 不可用:', e.message);
    }

    // 3. 检查 opencli 扩展状态
    console.log('\n--- 检查扩展连接 ---');
    var extState = await page.evaluate(`(function(){
      // 检查是否有 opencli 扩展注入的变量
      return {
        hasOpenCLI: typeof window.__opencli !== 'undefined',
        hasOpenCLIRegistry: typeof window.__opencli_registry !== 'undefined',
        // 检查 Chrome runtime
        hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
        // 检查是否有其他扩展相关的全局变量
        globals: Object.keys(window).filter(function(k){
          return k.toLowerCase().indexOf('open') >= 0 || k.toLowerCase().indexOf('cli') >= 0;
        }).slice(0, 10)
      };
    })()`);
    console.log(JSON.stringify(extState, null, 2));

    // 4. 检查 LinkedIn 页面类型
    console.log('\n--- LinkedIn 页面分析 ---');
    var pageType = await page.evaluate(`(function(){
      var url = window.location.href;
      var bodyText = document.body ? document.body.innerText : '';
      return {
        isFeed: url.indexOf('/feed/') >= 0,
        isTalentSearch: url.indexOf('/talent/search') >= 0,
        isTalentHome: url.indexOf('/talent/home') >= 0,
        hasSearchResults: !!document.querySelector('#results-container'),
        hasProfileList: !!document.querySelector('.profile-list__header-info-text'),
        bodyFirstLine: bodyText.substring(0, 100)
      };
    })()`);
    console.log(JSON.stringify(pageType, null, 2));

    return { success: true };
  }
});
