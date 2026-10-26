import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-url-params',
  access: 'read',
  description: '测试 LinkedIn 搜索 URL 参数哪些生效',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    // 基线：无筛选的搜索结果数
    async function getResultCount(url, label) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(5000);

      const actualUrl = await page.evaluate('window.location.href');
      const resultText = await page.evaluate(`(function(){
        var el = document.querySelector('[class*="results-count"], [class*="search-results"], [data-test-results-count]');
        if (el) return el.textContent.trim();
        // 找任何包含数字的文本
        var all = Array.from(document.querySelectorAll('*'));
        for (var i=0; i<all.length; i++) {
          var t = all[i].textContent.trim();
          if (/\\d+[,.]?\\d*\\s*(?:results?|结果)/i.test(t)) return t;
        }
        return '';
      })()`);

      // 提取前3个结果的公司名做对比
      const companies = await page.evaluate(`(function(){
        var cards = Array.from(document.querySelectorAll('a[href*="/in/"]'));
        var results = [];
        cards.slice(0, 3).forEach(function(a){
          var text = a.textContent.trim();
          var match = text.match(/目前就职[:：]?\\s*([^\\s]+)/);
          results.push(match ? match[1].substring(0, 20) : '');
        });
        return results;
      })()`);

      console.log(`${label}:`);
      console.log(`  URL: ${actualUrl.substring(0, 100)}`);
      console.log(`  结果提示: ${resultText.substring(0, 60) || '(无)'}`);
      console.log(`  前3公司: ${JSON.stringify(companies)}`);
      return { url: actualUrl, resultText, companies };
    }

    // 基线
    console.log('=== 基线（无筛选）===');
    const baseline = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer',
      '基线'
    );

    // 测试1: currentCompany（已验证生效）
    console.log('\n=== currentCompany ===');
    const t1 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&currentCompany=%5B%221441%22%5D',
      'currentCompany=Google'
    );

    // 测试2: pastCompany
    console.log('\n=== pastCompany ===');
    const t2 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&pastCompany=%5B%221441%22%5D',
      'pastCompany=Google'
    );

    // 测试3: school（用 Harvard 尝试）
    console.log('\n=== school ===');
    const t3 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&school=%5B%221660%22%5D',
      'school=Harvard(1660猜测)'
    );

    // 测试4: industry
    console.log('\n=== industry ===');
    const t4 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&industry=%5B%224%22%5D',
      'industry=4(猜测)'
    );

    // 测试5: profileLanguage
    console.log('\n=== profileLanguage ===');
    const t5 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&profileLanguage=%5B%22en%22%5D',
      'profileLanguage=en'
    );

    // 测试6: geoUrn（已知不生效，再确认）
    console.log('\n=== geoUrn ===');
    const t6 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&geoUrn=%5B%22urn%3Ali%3Ageo%3A103644278%22%5D',
      'geoUrn=US'
    );

    // 测试7: 组合参数
    console.log('\n=== 组合 currentCompany+pastCompany ===');
    const t7 = await getResultCount(
      'https://www.linkedin.com/search/results/people/?keywords=software+engineer&currentCompany=%5B%221441%22%5D&pastCompany=%5B%2210667%22%5D',
      'current=Google+past=Meta'
    );

    // 对比结果
    console.log('\n=== 对比分析 ===');
    const checkDiff = (label, t) => {
      const urlChanged = !t.url.includes('keywords=software%20engineer&');
      const hasRedirect = t.url.includes('origin=') || t.url.includes('facet');
      console.log(`${label}: URL保留=${!t.url.includes('login')}, 有facet标记=${hasRedirect}, 公司变化=${JSON.stringify(t.companies) !== JSON.stringify(baseline.companies)}`);
    };
    checkDiff('currentCompany', t1);
    checkDiff('pastCompany', t2);
    checkDiff('school', t3);
    checkDiff('industry', t4);
    checkDiff('profileLanguage', t5);
    checkDiff('geoUrn', t6);
    checkDiff('组合', t7);

    return { success: true };
  }
});
