import { cli, Strategy } from '@jackwener/opencli/registry';

/**
 * LinkedIn 人才搜索可行性测试
 * 验证：能否访问 LinkedIn 人才搜索页面并提取数据
 */

cli({
  site: 'linkedin',
  name: 'test-people-search',
  access: 'read',
  description: '测试 LinkedIn 人才搜索可行性',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'AI Engineer', help: '搜索关键词' },
    { name: 'location', type: 'string', default: 'Shanghai', help: '地点' },
  ],
  func: async (page, kwargs) => {
    console.log('\n=== LinkedIn 人才搜索可行性测试 ===\n');

    // 1. 构建人才搜索 URL
    const baseUrl = 'https://www.linkedin.com/search/results/people/';
    const params = new URLSearchParams();
    if (kwargs.keyword) params.set('keywords', kwargs.keyword);
    if (kwargs.location) params.set('location', kwargs.location);
    const searchUrl = `${baseUrl}?${params.toString()}`;

    console.log(`访问 URL: ${searchUrl}`);

    // 2. 导航到搜索页面
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(5000); // 等待页面加载

    // 3. 检查登录状态
    const currentUrl = await page.url();
    console.log(`当前页面: ${currentUrl}`);

    if (currentUrl.includes('login') || currentUrl.includes('auth')) {
      console.log('\n❌ 未登录 - 需要先登录 LinkedIn');
      return { success: false, error: 'not_logged_in' };
    }

    // 4. 截图查看页面状态
    const screenshotPath = '/tmp/linkedin-people-search-test.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n截图已保存: ${screenshotPath}`);

    // 5. 尝试提取人才卡片
    console.log('\n尝试提取人才卡片...');
    const results = await page.evaluate(() => {
      const cards = document.querySelectorAll('.entity-result__item');
      const data = [];

      cards.forEach((card, index) => {
        try {
          // 姓名
          const nameEl = card.querySelector('.entity-result__title-text a');
          const name = nameEl?.textContent?.trim() || '';

          // 个人主页
          const profileUrl = nameEl?.href || '';

          // 职位信息（格式: "职位 · 公司"）
          const headlineEl = card.querySelector('.entity-result__primary-subtitle');
          const headline = headlineEl?.textContent?.trim() || '';

          // 地点
          const locationEl = card.querySelector('.entity-result__secondary-subtitle');
          const location = locationEl?.textContent?.trim() || '';

          // 关系度
          const degreeEl = card.querySelector('.entity-result__badge-text');
          const connectionDegree = degreeEl?.textContent?.trim() || '';

          data.push({
            index: index + 1,
            name,
            headline,
            location,
            connectionDegree,
            profileUrl: profileUrl.split('?')[0] // 去掉参数
          });
        } catch (e) {
          console.warn(`解析第 ${index + 1} 条失败:`, e);
        }
      });

      return {
        cardCount: cards.length,
        extracted: data.length,
        data
      };
    });

    console.log(`\n找到 ${results.cardCount} 个卡片，成功提取 ${results.extracted} 条数据`);

    if (results.data.length > 0) {
      console.log('\n提取的样本数据（前3条）:');
      results.data.slice(0, 3).forEach(p => {
        console.log(`  ${p.index}. ${p.name} | ${p.headline} | ${p.connectionDegree}`);
      });
    }

    // 6. 检查结果
    const success = results.extracted > 0;
    console.log(`\n${success ? '✅ 测试通过' : '❌ 测试失败'} - ${success ? '成功提取人才数据' : '未能提取人才数据'}`);

    return {
      success,
      url: currentUrl,
      cardCount: results.cardCount,
      extractedCount: results.extracted,
      sample: results.data.slice(0, 3),
      screenshot: screenshotPath
    };
  }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
