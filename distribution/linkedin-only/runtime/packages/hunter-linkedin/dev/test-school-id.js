import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-school-id', access: 'read', description: 'find school ID from school page',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    const schools = ['stanford-university', 'harvard-university', 'tsinghua-university'];
    
    for (const s of schools) {
      await page.goto(`https://www.linkedin.com/school/${s}/`, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(5000);
      
      const html = await page.evaluate('document.documentElement.innerHTML');
      
      // 搜各种 ID 模式
      const patterns = [
        /urn:li:fsd[_-]school[:_](\d+)/g,
        /urn:li:school[:_](\d+)/g,
        /"schoolId":\s*(\d+)/g,
        /"entityUrn":"urn:li:school:(\d+)"/g,
        /company:(\d+)/g,  // 有些学校的 infrastructure 可能复用 company 体系
      ];
      
      const ids = new Set();
      for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
          ids.add(m[1]);
        }
      }
      
      console.log(`\n${s}:`);
      console.log('  找到 ID:', [...ids].slice(0, 10).join(', ') || '无');
      
      // 也搜 pageInstance
      const pageInstance = await page.evaluate(`(function(){
        var el = document.getElementById('clientPageInstance');
        return el ? el.textContent : null;
      })()`);
      console.log('  pageInstance:', pageInstance?.substring(0, 80) || '无');
    }
    
    return {success:true};
  }
});
