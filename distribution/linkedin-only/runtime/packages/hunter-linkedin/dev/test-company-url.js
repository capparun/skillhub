import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-company-url',
  access: 'read',
  description: '测试 currentCompany URL 参数是否生效',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    const tests = [
      {
        name: '数字ID格式',
        url: 'https://www.linkedin.com/search/results/people/?keywords=software+engineer&currentCompany=%5B%221441%22%5D'
      },
      {
        name: '公司URL格式',
        url: 'https://www.linkedin.com/search/results/people/?keywords=software+engineer&currentCompany=%5B%22https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Fgoogle%22%5D'
      },
      {
        name: '无筛选（对照）',
        url: 'https://www.linkedin.com/search/results/people/?keywords=software+engineer'
      }
    ];

    for (const test of tests) {
      console.log(`\n=== ${test.name} ===`);
      await page.goto(test.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(5000);

      const url = await page.evaluate('window.location.href');
      console.log('实际URL:', url.substring(0, 120));

      // 检查筛选 pills
      const pills = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('[data-test-filter-pill], .search-reusables__filter-pill-button, [aria-label*="filter"]')).map(p => p.textContent.trim()).filter(t => t).slice(0, 10);
      })()`);
      console.log('筛选pills:', JSON.stringify(pills));

      // 检查结果中的公司名
      const companies = await page.evaluate(`(function(){
        var cards = Array.from(document.querySelectorAll('a[href*="/in/"]'));
        var results = [];
        cards.slice(0, 5).forEach(function(a){
          var text = a.textContent.trim();
          // 找"目前就职"后面的公司名
          var match = text.match(/目前就职[:：]?\s*([^\s]+)/);
          results.push(match ? match[1] : '');
        });
        return results;
      })()`);
      console.log('前5个结果的公司:', JSON.stringify(companies));
    }

    return { success: true };
  }
});
