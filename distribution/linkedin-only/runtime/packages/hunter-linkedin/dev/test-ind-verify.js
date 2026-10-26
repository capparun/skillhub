import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-ind-verify', access: 'read', description: 'verify industry filter',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(6000);
      const cards = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim()).filter(t=>t.includes('•')).slice(0,5);
      })()`);
      console.log(`\n=== ${label} ===`);
      cards.forEach((c,i) => console.log(`  ${i+1}. ${c.substring(0,100)}`));
    }

    await check('https://www.linkedin.com/search/results/people/?keywords=engineer', '基线');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&industry=%5B%224%22%5D', 'industry=4');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&industry=%5B%2296%22%5D', 'industry=96');
    // 尝试组合多个 industry ID
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&industry=%5B%224%22%2C%2296%22%5D', 'industry=4,96');
    
    return {success:true};
  }
});
