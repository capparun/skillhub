import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-school-filter', access: 'read', description: 'test schoolFilter param',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(6000);
      const actualUrl = await page.evaluate('window.location.href');
      const cards = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim()).filter(t=>t.includes('•')&&t.length>30).slice(0,5);
      })()`);
      console.log(`\n=== ${label} ===`);
      console.log('  URL:', actualUrl.substring(0, 120));
      cards.forEach((c,i) => console.log(`  ${i+1}. ${c.substring(0, 120)}`));
    }

    // 基线
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer', '基线');
    
    // 测试 schoolFilter（参数保留，看看是否有不同）
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&schoolFilter=%5B%2217926%22%5D', 'schoolFilter=[17926]');

    // 测试带 origin
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&schoolFilter=%5B%2217926%22%5D', 'origin+schoolFilter');
    
    return {success:true};
  }
});
