import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin',
  name: 'test-geo-user',
  access: 'read',
  description: '测试用户提供的 geoUrn URL',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    // 用户提供的精确 URL
    const userUrl = 'https://www.linkedin.com/search/results/people/?keywords=software%20engineer&origin=FACETED_SEARCH&geoUrn=%5B%22102890883%22%5D';
    console.log('访问用户提供的 URL:', userUrl);
    
    await page.goto(userUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(8000);
    
    const actualUrl = await page.evaluate('window.location.href');
    console.log('\n实际 URL:', actualUrl);
    
    // 检查 URL 中的 geoUrn
    const geoMatch = actualUrl.match(/geoUrn=([^&]+)/);
    console.log('geoUrn 参数:', geoMatch ? decodeURIComponent(geoMatch[1]) : '无');
    
    // 检查筛选 pills
    const pills = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('[data-test-filter-pill], .search-reusables__filter-pill-button')).map(p => p.textContent.trim()).filter(t=>t).slice(0,10);
    })()`);
    console.log('筛选 pills:', JSON.stringify(pills));
    
    // 检查地点筛选区域
    const locationSection = await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('*'));
      for(var i=0;i<all.length;i++){
        var t = all[i].textContent.trim();
        if(t==='地点'||t==='Location'){
          var section = all[i].closest('fieldset,section,div[role="group"]')||all[i].parentElement;
          var cbs = section?section.querySelectorAll('input[type="checkbox"]:checked'):[];
          var checked = Array.from(cbs).map(cb=>{
            var lbl = document.querySelector('label[for="'+cb.id+'"]');
            return lbl?lbl.textContent.trim():cb.id;
          });
          return {found:true, checked:checked};
        }
      }
      return {found:false};
    })()`);
    console.log('地点筛选:', JSON.stringify(locationSection));
    
    // 检查结果地点
    const locs = await page.evaluate(`(function(){
      var cards = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      var results = [];
      cards.slice(0,5).forEach(function(a){
        var text = a.textContent.trim();
        var match = text.match(/(美国|United States|中国|北京|上海|新加坡|马来西亚|英国|伦敦)/);
        results.push(match?match[1]:'');
      });
      return results;
    })()`);
    console.log('前5个地点:', JSON.stringify(locs));
    
    return {success:true};
  }
});
