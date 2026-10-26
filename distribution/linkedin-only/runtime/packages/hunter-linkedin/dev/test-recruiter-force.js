import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-force',
  access: 'read',
  description: '尝试强制触发 Ember 渲染',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    console.log('=== 尝试多种方式强制渲染 ===');

    // 方法1: WebSocket 保持活跃
    var r1 = await page.evaluate(`(function(){
      try {
        var ws = new WebSocket('wss://echo.websocket.org/');
        window._ws = ws;
        return {wsCreated: true};
      } catch(e) {
        return {wsCreated: false, error: e.message};
      }
    })()`);
    console.log('WebSocket:', JSON.stringify(r1));

    // 方法2: 访问 Ember 内部
    var r2 = await page.evaluate(`(function(){
      var results = [];
      // 检查所有可能的 Ember 入口
      if(window.Ember) results.push('window.Ember');
      if(window.require) results.push('window.require');
      if(window.define) results.push('window.define');

      // 检查 DOM 元素上的私有属性
      var el = document.querySelector('.artdeco-entity-lockup');
      if(el){
        var keys = Object.keys(el);
        var emberKeys = keys.filter(k => k.indexOf('ember') >= 0 || k.indexOf('__') === 0);
        results.push('emberKeys:' + emberKeys.join(','));
      }

      // 尝试 requirejs 获取 Ember
      var emberApp = null;
      if(window.require && window.require.has && window.require.has('ember')){
        try { emberApp = window.require('ember'); } catch(e) {}
      }

      return {
        globals: results,
        hasRequire: !!window.require,
        emberAppKeys: emberApp ? Object.keys(emberApp).slice(0, 10) : []
      };
    })()`);
    console.log('Ember探测:', JSON.stringify(r2, null, 2));

    // 方法3: 强制触发 reflow + requestAnimationFrame
    var r3 = await page.evaluate(`(function(){
      document.body.offsetHeight; // force reflow
      var start = Date.now();
      var frames = 0;
      function tick(){
        frames++;
        if(Date.now() - start < 3000){
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
      return {started: true};
    })()`);
    console.log('RAF:', JSON.stringify(r3));

    await sleep(10000);

    // 检查结果
    var state = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      var ghosts = container ? container.querySelectorAll('[data-test-ghost-row-entity-lockup-img]') : [];
      var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
      return {
        lockups: lockups.length,
        ghosts: ghosts.length,
        realCards: realCards.length,
        url: window.location.href
      };
    })()`);
    console.log('10s后状态:', JSON.stringify(state));

    return { success: true };
  }
});
