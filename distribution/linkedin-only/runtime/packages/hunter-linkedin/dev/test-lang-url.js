import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-lang-url', access: 'read', description: 'test language url param',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(6000);
      const cards = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim().substring(0,120)).filter(t=>t.includes('•')).slice(0,5);
      })()`);
      console.log(`\n=== ${label} ===`);
      cards.forEach((c,i) => console.log(`  ${i+1}. ${c}`));
    }

    // 基线（中文界面下的结果）
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer', '基线（无 lang）');

    // 英语
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&profileLanguage=%5B%22en%22%5D', 'lang=en');

    // 中文
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&profileLanguage=%5B%22zh%22%5D', 'lang=zh');

    return {success:true};
  }
});
