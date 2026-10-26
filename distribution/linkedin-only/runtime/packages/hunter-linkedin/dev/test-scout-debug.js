import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-scout-debug',
  access: 'read',
  description: '调试 linkedin-scout 地点筛选',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    // 测试: 用户提供的 URL 格式（带 origin=FACETED_SEARCH）
    await page.goto('https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&geoUrn=%5B%22102890883%22%5D', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(5000);

    // 2. 检查实际 URL
    var url = await page.evaluate('window.location.href');
    console.log('实际 URL:', url);

    // 3. 检查页面上的筛选 pills/tags
    var pills = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('[aria-label*="filter"], [data-test-filter-pill], .search-reusables__filter-pill-button')).map(function(p){
        return p.textContent.trim();
      }).slice(0, 10);
    })()`);
    console.log('筛选 pills:', JSON.stringify(pills, null, 2));

    // 4. 检查左侧筛选面板中的地点选项
    var locationFilter = await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('*'));
      var locationSection = null;
      for(var i=0;i<all.length;i++){
        var t = all[i].textContent.trim();
        if(t === '地点' || t === 'Location' || t.indexOf('地理位置') >= 0){
          locationSection = all[i];
          break;
        }
      }
      if(!locationSection) return { found: false };

      // 找该区域内已勾选的 checkbox
      var section = locationSection.closest('fieldset, section, div[role="group"]') || locationSection.parentElement;
      var checkboxes = section ? section.querySelectorAll('input[type="checkbox"]') : [];
      var checked = [];
      Array.from(checkboxes).forEach(function(cb){
        if(cb.checked){
          var label = document.querySelector('label[for="' + cb.id + '"]');
          checked.push(label ? label.textContent.trim() : cb.id);
        }
      });
      return { found: true, checked: checked };
    })()`);
    console.log('地点筛选状态:', JSON.stringify(locationFilter, null, 2));

    // 5. 提取结果中的地点
    var cards = await page.evaluate(`(function(){
      var links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      var results = [];
      links.slice(0, 5).forEach(function(a){
        var text = a.textContent.trim();
        // 提取地点（在 "度" 之后）
        var match = text.match(/\d+\s*度([^目前就职曾经就职]+)/);
        results.push({
          name: text.split('•')[0].trim().substring(0, 20),
          location: match ? match[1].trim().substring(0, 30) : ''
        });
      });
      return results;
    })()`);
    console.log('前5个结果的地点:', JSON.stringify(cards, null, 2));

    return { success: true };
  }
});
