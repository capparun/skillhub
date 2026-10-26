import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-school-direct', access: 'read', description: 'test school URL directly',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(6000);
      const actualUrl = await page.evaluate('window.location.href');
      console.log(`\n=== ${label} ===`);
      console.log('URL保留:', actualUrl === url || actualUrl.includes('school'));
      console.log('实际:', actualUrl.substring(0, 130));
      
      const cards = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim()).filter(t=>t.includes('•')).slice(0,3).join(' | ');
      })()`);
      console.log('结果:', cards.substring(0, 150));
    }

    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer', '基线');

    // 测试各种可能的 school 参数格式
    // 格式1: school=数字ID数组
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&school=%5B%2217926%22%5D', 'school=[17926]');

    // 格式2: schoolFilter
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&schoolFilter=%5B%2217926%22%5D', 'schoolFilter');

    // 格式3: facetSchool
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&facetSchool=%5B%2217926%22%5D', 'facetSchool');

    // 格式4: 用 organization ID (schools might use same IDs as companies)
    await check('https://www.linkedin.com/search/results/people/?keywords=software+engineer&currentCompany=%5B%2217926%22%5D', 'currentCompany as school');

    return {success:true};
  }
});
