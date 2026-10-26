import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-si-final', access: 'read', description: 'final school/industry test',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(5000);
        const actual = await page.evaluate('window.location.href');
        const hasParam = actual.includes('school') || actual.includes('industry');
        console.log(`${label}: URL保留=${hasParam} (${actual.substring(0,100)})`);
      } catch(e) {
        console.log(`${label}: 超时/失败`);
      }
    }

    // school 测试
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&school=%5B%2217926%22%5D', 'school=num');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&origin=FACETED_SEARCH&school=%5B%2217926%22%5D', 'school+origin');
    
    // industry 测试
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&industry=%5B%224%22%5D', 'industry=4');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&origin=FACETED_SEARCH&industry=%5B%224%22%5D', 'industry+origin');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&industry=%5B%2296%22%5D', 'industry=96');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&origin=FACETED_SEARCH&industry=%5B%2296%22%5D', 'industry=96+origin');
    
    return {success:true};
  }
});
