import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-url-check',
  access: 'read',
  description: '检查导航后的实际URL',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 导航到 talent/search ===');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    var url1 = await page.evaluate('window.location.href');
    console.log('导航后 URL:', url1);
    console.log('是否包含 /talent/:', url1.includes('/talent/'));
    console.log('是否包含 login:', url1.includes('login'));

    console.log('\n=== 导航到搜索URL ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    var url2 = await page.evaluate('window.location.href');
    console.log('搜索URL后:', url2);
    console.log('是否包含 /talent/:', url2.includes('/talent/'));

    return { success: true };
  }
});
