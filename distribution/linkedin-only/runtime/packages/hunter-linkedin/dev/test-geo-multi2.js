import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin',
  name: 'test-geo-multi2',
  access: 'read',
  description: '测试 geoUrn URL 结果',
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
    
    // 提取卡片完整文本
    const cards = await page.evaluate(`(function(){
      var links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
      var results = [];
      var seen = new Set();
      links.forEach(function(a){
        var text = a.textContent.trim().replace(/\s+/g,' ');
        if(!seen.has(text) && text.includes('•')){
          seen.add(text);
          results.push(text.substring(0,80));
        }
      });
      return results.slice(0,8);
    })()`);
    
    console.log('\n前8张卡片:');
    cards.forEach((c,i) => console.log(`  ${i+1}. ${c}`));
    
    // 统计地点关键词
    const allText = cards.join(' ');
    const keywords = ['中国','北京','上海','深圳','美国','United States','新加坡','Singapore','马来西亚'];
    console.log('\n地点统计:');
    keywords.forEach(k => {
      const count = (allText.match(new RegExp(k,'g'))||[]).length;
      if(count > 0) console.log(`  ${k}: ${count}次`);
    });
    
    return {success:true};
  }
});
