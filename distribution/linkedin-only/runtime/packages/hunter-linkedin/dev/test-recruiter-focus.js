import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-focus',
  access: 'read',
  description: '尝试让 tab 前台化后测试 facet',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 导航 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // 尝试让页面认为自己在前台
    console.log('\n=== 尝试解除后台节流 ===');
    await page.evaluate(`(function(){
      // 方法1: 播放无声音频
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        window._keepAliveOsc = osc;
        return {audio: true};
      } catch(e) {
        return {audio: false, error: e.message};
      }
    })()`);

    await sleep(2000);

    // 检查 document.hidden
    var vis = await page.evaluate(`(function(){
      return {
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus()
      };
    })()`);
    console.log('页面状态:', JSON.stringify(vis));

    await sleep(5000);

    // 打开 facet 面板
    console.log('\n=== 打开 facet 面板 ===');
    await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<all.length;i++){
        var text = (all[i].textContent || '').trim().toLowerCase();
        if(text.indexOf('show filters')>=0){ all[i].click(); return {clicked: true}; }
      }
      return {clicked: false};
    })()`);
    await sleep(3000);

    // 打开 Job Titles
    await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<all.length;i++){
        var aria = (all[i].getAttribute('aria-label') || '').toLowerCase();
        if(aria.indexOf('job titles')>=0 && aria.indexOf('add')>=0){ all[i].click(); return {clicked: true}; }
      }
      return {clicked: false};
    })()`);
    await sleep(2000);

    // 输入
    await page.evaluate(`(function(){
      var inputs = document.querySelectorAll('input[role=combobox], input[type=text]');
      var target = null;
      for(var i=inputs.length-1;i>=0;i--){
        if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ target = inputs[i]; break; }
      }
      if(!target) return {found: false};
      target.focus();
      target.value = 'Software Engineer';
      var ev = new Event('input', { bubbles: true });
      Object.defineProperty(ev, 'target', { value: target, enumerable: true });
      target.dispatchEvent(ev);
      return {found: true};
    })()`);
    await sleep(8000);

    // 点击选项
    console.log('\n=== 点击选项 ===');
    await page.evaluate(`(function(){
      var opt = document.querySelector('li[role=option]');
      if(opt){
        opt.click();
        return {clicked: true, html: opt.outerHTML.substring(0, 100)};
      }
      return {clicked: false};
    })()`);

    // 长等待观察
    console.log('\n=== 长等待 30s 观察 ===');
    for(let i=0; i<6; i++){
      await sleep(5000);
      var state = await page.evaluate(`(function(){
        return {
          url: window.location.href,
          pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
          lockups: document.querySelectorAll('.artdeco-entity-lockup').length,
          optSelected: (document.querySelector('li[role=option]') || {}).getAttribute('aria-selected')
        };
      })()`);
      console.log(`  ${(i+1)*5}s - pills=${state.pills.length}, lockups=${state.lockups}, aria-selected=${state.optSelected}`);
    }

    return { success: true };
  }
});
