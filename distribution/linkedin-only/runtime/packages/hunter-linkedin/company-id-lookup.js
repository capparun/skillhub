import { cli, Strategy } from '@jackwener/opencli/registry';
import { getLinkedInTier, getCompanyPageUrl } from './lib/index.js';
import { extractCompanyIdsFromHtml, extractTargetCompanyId } from './lib/company-page.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'company-id-lookup',
  access: 'read',
  description: '查询 LinkedIn 公司数字 ID',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'company', type: 'string', required: true, description: '公司 vanity name（如 google, microsoft, amazon）' }
  ],
  func: async (page, kwargs) => {
    const { company } = kwargs;
    const linkedinTier = getLinkedInTier();
    const url = getCompanyPageUrl(linkedinTier, company);

    console.error(`查询公司: ${company}`);
    console.error(`访问: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(5000);

    // Browser Bridge 对长字符串脚本的解析不稳定；只读取 HTML，随后在本地解析。
    const html = await page.evaluate(() => document.documentElement.innerHTML);
    const candidates = extractCompanyIdsFromHtml(html);
    const companyId = extractTargetCompanyId(html);

    console.error('\n精确匹配:', companyId);
    console.error('所有候选:', candidates.slice(0, 10), '...共', candidates.length, '个');

    // 方法2: 尝试从 URL 重定向或 canonical 链接找
    const currentUrl = await page.evaluate('window.location.href');
    console.error('当前URL:', currentUrl);

    // 方法3: 检查页面标题中的公司名
    const title = await page.evaluate('document.title');
    console.error('页面标题:', title);

    return {
      success: Boolean(companyId),
      company,
      companyId,
      candidates,
      currentUrl,
      title,
    };
  }
});
