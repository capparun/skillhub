import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-geo-after-facet',
  access: 'read',
  description: 'facet 面板成功设置地点后检查 URL',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    // 1. 访问搜索页
    await page.goto('https://www.linkedin.com/search/results/people/?keywords=software+engineer', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(5000);
    console.log('初始 URL:', await page.evaluate('window.location.href'));

    // 2. 打开 facet 面板
    console.log('\n打开 facet 面板...');
    await page.evaluate(`(function() {
      var keywords = ['全部筛选条件', 'All filters'];
      var all = Array.from(document.querySelectorAll('*'));
      for (var i = 0; i < all.length; i++) {
        var text = (all[i].textContent || '').trim().replace(/\\s+/g, ' ');
        for (var j = 0; j < keywords.length; j++) {
          if (text === keywords[j] || text.indexOf(keywords[j]) >= 0) {
            var el = all[i];
            for (var d = 0; d < 5; d++) {
              if (!el) break;
              var tag = el.tagName.toLowerCase();
              if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
                el.click();
                return 'clicked: ' + text;
              }
              el = el.parentElement;
            }
          }
        }
      }
      return 'not found';
    })()`);
    await sleep(3000);

    // 3. 用 MouseEvent 模拟真实点击"美国" checkbox（触发 React）
    console.log('点击"美国"...');
    const clicked = await page.evaluate(`(function() {
      var all = Array.from(document.querySelectorAll('*'));
      var targetEl = null;
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent || '').trim();
        if (t === '美国' || t === 'United States') {
          targetEl = all[i];
          break;
        }
      }
      if (!targetEl) return '美国 not found';

      // 找 checkbox
      var cb = targetEl.querySelector('input[type="checkbox"]');
      if (!cb && targetEl.parentElement) cb = targetEl.parentElement.querySelector('input[type="checkbox"]');
      if (!cb && targetEl.parentElement && targetEl.parentElement.parentElement) {
        cb = targetEl.parentElement.parentElement.querySelector('input[type="checkbox"]');
      }
      if (!cb) return 'checkbox not found';

      // 模拟真实鼠标事件
      var rect = cb.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      var mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      var click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      cb.dispatchEvent(mousedown);
      cb.dispatchEvent(mouseup);
      cb.dispatchEvent(click);

      return 'clicked checkbox, checked=' + cb.checked;
    })()`);
    console.log('点击结果:', clicked);
    await sleep(2000);

    // 4. 点击"显示结果"
    console.log('点击"显示结果"...');
    await page.evaluate(`(function() {
      var texts = ['显示结果', 'Show results'];
      var btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].textContent.trim();
        for (var j = 0; j < texts.length; j++) {
          if (t === texts[j] || t.indexOf(texts[j]) >= 0) {
            btns[i].click();
            return 'clicked: ' + t;
          }
        }
      }
      return 'not found';
    })()`);
    await sleep(5000);

    // 5. 检查 URL
    const finalUrl = await page.evaluate('window.location.href');
    console.log('\n=== facet 设置后的 URL ===');
    console.log(finalUrl);

    // 解码所有参数
    console.log('\n=== 参数解析 ===');
    const params = new URL(finalUrl).searchParams;
    for (const [key, value] of params) {
      console.log(`  ${key}: ${decodeURIComponent(value)}`);
    }

    // 6. 检查筛选是否生效
    const locs = await page.evaluate(`(function(){
      var cards = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      var results = [];
      cards.slice(0, 5).forEach(function(a){
        var text = a.textContent.trim();
        var match = text.match(/(美国|United States|中国|北京|上海|新加坡)/);
        results.push(match ? match[1] : '');
      });
      return results;
    })()`);
    console.log('\n前5个地点:', JSON.stringify(locs));

    return { success: true, url: finalUrl };
  }
});
