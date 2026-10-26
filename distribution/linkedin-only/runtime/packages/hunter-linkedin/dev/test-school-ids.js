import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-school-ids', access: 'read', description: 'test both school ID types',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(6000);
      const actual = await page.evaluate('window.location.href');
      const cards = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim()).filter(t=>t.includes('•')).slice(0,3);
      })()`);
      const retained = actual.includes('schoolFilter');
      console.log(`\n${label}: 保留=${retained}`);
      cards.forEach((c,i) => console.log(`  ${c.substring(0,100)}`));
    }

    // 基线
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer', '基线');

    // fsd_school ID (from page extraction)
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&schoolFilter=%5B%2217926%22%5D', 'fsd_school=17926(Stanford)');
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&schoolFilter=%5B%2211398%22%5D', 'fsd_school=11398(Tsinghua)');

    // 用户用的 ID
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&schoolFilter=%5B%221792%22%5D', '用户用的=1792');
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&origin=FACETED_SEARCH&schoolFilter=%5B%2214022%22%5D', '用户用的=14022');
    
    return {success:true};
  }
});
