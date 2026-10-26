import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-facet-url',
  access: 'read',
  description: '测试 URL 参数是否支持 facet 筛选',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    // 测试更多 URL 参数组合
    const urls = [
      'https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0',
      'https://www.linkedin.com/talent/search?searchBoolean=engineer&title=Software%20Engineer&start=0',
      'https://www.linkedin.com/talent/search?searchBoolean=engineer&geoUrn=urn%3Ali%3Ageo%3A102277331&start=0',
      'https://www.linkedin.com/talent/search?keywords=engineer&title=Software%20Engineer&start=0',
    ];

    for (const url of urls) {
      console.log('\n=== 测试 URL:', url.substring(0, 80), '===');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(10000);

      var state = await page.evaluate(`(function(){
        return {
          url: window.location.href,
          pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
          totalText: (document.querySelector('.profile-list__header-info-text') || {}).textContent || '',
          lockups: document.querySelectorAll('.artdeco-entity-lockup').length
        };
      })()`);
      console.log('  URL:', state.url.substring(0, 120));
      console.log('  Pills:', state.pills);
      console.log('  Total:', state.totalText.trim());
      console.log('  Lockups:', state.lockups);
    }

    return { success: true };
  }
});
