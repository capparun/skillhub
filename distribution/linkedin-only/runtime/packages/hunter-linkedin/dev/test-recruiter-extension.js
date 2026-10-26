import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-extension',
  access: 'read',
  description: '尝试通过 chrome.runtime 让扩展激活 tab',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    console.log('=== 尝试通过 chrome.runtime 激活 tab ===');
    var r = await page.evaluate(`(function(){
      if(typeof chrome === 'undefined' || !chrome.runtime){
        return {hasChrome: false};
      }
      // 获取扩展 ID（opencli 扩展）
      var extIds = [];
      try {
        // 尝试向所有可能的扩展发送消息
        // opencli 扩展通常有特定的 ID
        chrome.runtime.sendMessage('opencli', {action: 'activateTab'}, function(resp){
          if(chrome.runtime.lastError){
            // ignore
          }
        });
      } catch(e) {}

      return {
        hasChrome: true,
        hasRuntime: !!chrome.runtime,
        hasTabs: !!(chrome.runtime && chrome.tabs)
      };
    })()`);
    console.log('chrome API:', JSON.stringify(r));

    // 尝试另一种方式：修改 window.onblur 和 window.onfocus
    console.log('\n=== 尝试欺骗 focus 状态 ===');
    await page.evaluate(`(function(){
      // 拦截 visibilitychange
      var originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      if(originalDescriptor){
        Object.defineProperty(document, 'hidden', {
          get: function() { return false; },
          configurable: true
        });
      }
      var originalVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
      if(originalVis){
        Object.defineProperty(document, 'visibilityState', {
          get: function() { return 'visible'; },
          configurable: true
        });
      }
      // 派发 visibilitychange 事件
      document.dispatchEvent(new Event('visibilitychange'));
      return {
        hidden: document.hidden,
        visibilityState: document.visibilityState
      };
    })()`);

    await sleep(1000);
    var vis = await page.evaluate(`(function(){
      return {
        hidden: document.hidden,
        visibilityState: document.visibilityState
      };
    })()`);
    console.log('欺骗后状态:', JSON.stringify(vis));

    console.log('\n等待 15s...');
    await sleep(15000);

    var state = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      var ghosts = container ? container.querySelectorAll('[data-test-ghost-row-entity-lockup-img]') : [];
      var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
      return {
        lockups: lockups.length,
        ghosts: ghosts.length,
        realCards: realCards.length
      };
    })()`);
    console.log('15s后:', JSON.stringify(state));

    return { success: true };
  }
});
