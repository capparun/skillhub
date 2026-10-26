import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin',
  name: 'test-geo-compare',
  access: 'read',
  description: '对比有无 geoUrn 的结果差异',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    async function getLocations(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(8000);
      
      const cards = await page.evaluate(`(function(){
        var links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
        var results = [];
        var seen = new Set();
        links.forEach(function(a){
          var text = a.textContent.trim().replace(/\\s+/g,' ');
          if(!seen.has(text) && text.includes('•')){
            seen.add(text);
            results.push(text.substring(0,100));
          }
        });
        return results.slice(0,10);
      })()`);
      
      const allText = cards.join(' ');
      const stats = {};
      ['中国','美国','United States','新加坡','马来西亚','北京','上海','深圳','西雅图','森尼韦尔','剑桥'].forEach(k => {
        const count = (allText.match(new RegExp(k,'g'))||[]).length;
        if(count > 0) stats[k] = count;
      });
      
      console.log(`\n=== ${label} ===`);
      console.log('URL:', (await page.evaluate('window.location.href')).substring(0,120));
      console.log('地点统计:', JSON.stringify(stats));
      return stats;
    }
    
    // 测试1: 有 geoUrn
    const withGeo = await getLocations(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&geoUrn=%5B%22102890883%22%2C%22103644278%22%2C%22102095887%22%5D',
      '有 geoUrn'
    );
    
    // 测试2: 无 geoUrn（基线）
    const withoutGeo = await getLocations(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer',
      '无 geoUrn（基线）'
    );
    
    // 对比
    console.log('\n=== 对比 ===');
    const allKeys = new Set([...Object.keys(withGeo), ...Object.keys(withoutGeo)]);
    allKeys.forEach(k => {
      const a = withGeo[k] || 0;
      const b = withoutGeo[k] || 0;
      const diff = a !== b ? ` (有:${a} vs 无:${b})` : '';
      console.log(`  ${k}: ${diff || a}`);
    });
    
    return {success:true};
  }
});
