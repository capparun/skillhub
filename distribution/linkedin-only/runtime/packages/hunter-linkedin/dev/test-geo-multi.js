import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin',
  name: 'test-geo-multi',
  access: 'read',
  description: '测试用户提供的多 geoUrn URL',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    const url = 'https://www.linkedin.com/search/results/people/?keywords=software%20engineer&origin=FACETED_SEARCH&geoUrn=%5B%22102890883%22%2C%22103644278%22%2C%22102095887%22%5D';
    console.log('访问:', url);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(8000);
    
    const actualUrl = await page.evaluate('window.location.href');
    console.log('\n实际 URL:', actualUrl);
    
    // 检查结果地点分布
    const locs = await page.evaluate(`(function(){
      var cards = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      var results = [];
      cards.slice(0,10).forEach(function(a){
        var text = a.textContent.trim();
        // 提取地点（度数之后）
        var m = text.match(/\d+\s*度([^•]+)/);
        if(m) results.push(m[1].trim().substring(0,30));
      });
      return results;
    })()`);
    console.log('\n前10个地点:');
    locs.forEach((l,i) => console.log(`  ${i+1}. ${l}`));
    
    // 检查是否有 facet 标记
    const hasFacet = actualUrl.includes('origin=FACETED_SEARCH');
    console.log('\n有 facet 标记:', hasFacet);
    
    // 统计地点分布
    const usCount = locs.filter(l => l.includes('美国') || l.includes('United States')).length;
    const cnCount = locs.filter(l => l.includes('中国')).length;
    console.log(`美国相关: ${usCount}/${locs.length}`);
    console.log(`中国相关: ${cnCount}/${locs.length}`);
    
    return {success:true};
  }
});
