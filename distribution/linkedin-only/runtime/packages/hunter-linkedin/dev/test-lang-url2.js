import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-lang-url2', access: 'read', description: 'test language param with ja/ko',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    async function check(url, label) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(6000);
      const cards = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim().replace(/\\s+/g,' ').substring(0,150)).filter(t=>t.includes('•')).slice(0,5);
      })()`);
      console.log(`\n=== ${label} ===`);
      cards.forEach((c,i) => console.log(`  ${i+1}. ${c}`));
    }
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer', '基线');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&profileLanguage=%5B%22ja%22%5D', 'lang=ja (日语)');
    await check('https://www.linkedin.com/search/results/people/?keywords=engineer&profileLanguage=%5B%22ko%22%5D', 'lang=ko (韩语)');
    return {success:true};
  }
});
