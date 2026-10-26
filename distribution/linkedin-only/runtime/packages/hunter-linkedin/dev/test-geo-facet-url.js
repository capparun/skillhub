import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-geo-facet-url',
  access: 'read',
  description: 'facet 面板选地点后检查 URL 格式',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    // 1. 先访问无筛选的搜索页
    await page.goto('https://www.linkedin.com/search/results/people/?keywords=software+engineer', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(5000);

    console.log('初始 URL:', await page.evaluate('window.location.href'));

    // 2. 打开"全部筛选条件"面板
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

    // 3. 滚动面板找地点区域
    console.log('滚动面板...');
    for (let i = 0; i < 6; i++) {
      await page.evaluate(`(function() {
        var all = Array.from(document.querySelectorAll('*'));
        var bestPanel = null;
        var bestScore = 0;
        for (var j = 0; j < all.length; j++) {
          var el = all[j];
          var rect = el.getBoundingClientRect();
          var style = window.getComputedStyle(el);
          if (rect.left > window.innerWidth * 0.5 && rect.height > 200) {
            var score = rect.height;
            if (style.position === 'fixed' || style.position === 'absolute') score += 1000;
            if (el.scrollHeight > el.clientHeight) score += 500;
            if (score > bestScore) { bestScore = score; bestPanel = el; }
          }
        }
        if (bestPanel) { bestPanel.scrollBy(0, 400); return 'scrolled'; }
        return 'none';
      })()`);
      await sleep(500);
    }
    await sleep(1000);

    // 4. 点击"美国" checkbox
    console.log('点击"美国"...');
    const clicked = await page.evaluate(`(function() {
      var all = Array.from(document.querySelectorAll('*'));
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent || '').trim();
        if (t === '美国' || t === 'United States') {
          var el = all[i];
          // 找附近的 checkbox
          var cb = el.querySelector('input[type="checkbox"]');
          if (!cb && el.parentElement) cb = el.parentElement.querySelector('input[type="checkbox"]');
          if (!cb && el.parentElement && el.parentElement.parentElement) {
            cb = el.parentElement.parentElement.querySelector('input[type="checkbox"]');
          }
          if (cb) {
            cb.click();
            return 'clicked checkbox for: ' + t;
          }
          // 没有 checkbox，尝试直接点击元素
          el.click();
          return 'clicked element: ' + t;
        }
      }
      return 'not found';
    })()`);
    console.log('点击结果:', clicked);
    await sleep(2000);

    // 5. 点击"显示结果"
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

    // 6. 检查 URL
    const finalUrl = await page.evaluate('window.location.href');
    console.log('\n=== 最终 URL ===');
    console.log(finalUrl);

    // 解码 geoUrn 参数
    const geoMatch = finalUrl.match(/geoUrn=([^&]+)/);
    if (geoMatch) {
      console.log('\ngeoUrn 参数:', decodeURIComponent(geoMatch[1]));
    }

    // 检查地点筛选是否生效
    const locs = await page.evaluate(`(function(){
      var cards = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      var results = [];
      cards.slice(0, 5).forEach(function(a){
        var text = a.textContent.trim();
        var match = text.match(/(美国|United States|中国|北京|上海)/);
        results.push(match ? match[1] : '');
      });
      return results;
    })()`);
    console.log('\n前5个地点:', JSON.stringify(locs));

    return { success: true, url: finalUrl };
  }
});
