import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-boolean',
  access: 'read',
  description: '测试 boolean search 语法是否支持 title/company 筛选',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    const tests = [
      {
        name: '纯关键词',
        url: 'https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0'
      },
      {
        name: 'title语法',
        url: 'https://www.linkedin.com/talent/search?searchBoolean=title%3A%22Software%20Engineer%22&start=0'
      },
      {
        name: '关键词+title',
        url: 'https://www.linkedin.com/talent/search?searchBoolean=engineer%20title%3A%22Software%20Engineer%22&start=0'
      },
      {
        name: 'company语法',
        url: 'https://www.linkedin.com/talent/search?searchBoolean=company%3AGoogle&start=0'
      },
      {
        name: 'OR语法',
        url: 'https://www.linkedin.com/talent/search?searchBoolean=engineer%20OR%20architect&start=0'
      },
      {
        name: 'AND语法',
        url: 'https://www.linkedin.com/talent/search?searchBoolean=engineer%20AND%20robotics&start=0'
      }
    ];

    for (const test of tests) {
      console.log(`\n=== ${test.name} ===`);
      console.log('URL:', test.url.substring(0, 100));

      await page.goto(test.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(12000); // 长等待让后台tab也能加载

      var state = await page.evaluate(`(function(){
        // 检查搜索框内容
        var searchBox = document.querySelector('#system-search-typeahead');
        var searchValue = searchBox ? searchBox.value : '';

        // 检查 pills
        var pills = Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim());

        // 检查结果数
        var totalText = (document.querySelector('.profile-list__header-info-text') || {}).textContent || '';

        // 检查 lockups
        var lockups = document.querySelectorAll('.artdeco-entity-lockup').length;

        return {
          url: window.location.href,
          searchValue: searchValue,
          pills: pills,
          totalText: totalText.trim(),
          lockups: lockups
        };
      })()`);

      console.log('  实际URL:', state.url.substring(0, 120));
      console.log('  搜索框:', state.searchValue);
      console.log('  Pills:', state.pills);
      console.log('  结果:', state.totalText);
      console.log('  Lockups:', state.lockups);
    }

    return { success: true };
  }
});
