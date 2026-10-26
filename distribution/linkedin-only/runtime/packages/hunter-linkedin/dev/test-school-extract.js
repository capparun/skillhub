import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-school-extract', access: 'read', description: 'extract school IDs',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    const schools = [
      { name: 'Stanford', vanity: 'stanford-university' },
      { name: 'Tsinghua', vanity: 'tsinghua-university' },
      { name: 'Harvard', vanity: 'harvard-university' },
    ];

    for (const s of schools) {
      await page.goto(`https://www.linkedin.com/school/${s.vanity}/`, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(5000);
      const html = await page.evaluate('document.documentElement.innerHTML');
      
      // 搜各种可能的 school/org ID 模式
      const patterns = {
        'fsd_school': /urn:li:fsd[_-]school[:_](\d+)/g,
        'school:': /urn:li:school:(\d+)/g,
        'organization:': /urn:li:organization:(\d+)/g,
        'fsd_organization': /urn:li:fsd[_-]organization[:_](\d+)/g,
        'schoolId': /"schoolId":\s*(\d+)/g,
        'orgId': /"organizationId":\s*(\d+)/g,
        'entityUrn': /"entityUrn":"urn:li:(?:school|organization):(\d+)"/g,
      };
      
      console.log(`\n${s.name} (${s.vanity}):`);
      for (const [label, pattern] of Object.entries(patterns)) {
        const ids = new Set();
        let m;
        while ((m = pattern.exec(html)) !== null) ids.add(m[1]);
        if (ids.size > 0) console.log(`  ${label}: ${[...ids].join(', ')}`);
      }
      
      // 找页面标题附近的 organization ID
      const titleId = await page.evaluate(`(function(){
        var title = document.querySelector('h1');
        if(!title) return null;
        var p = title.closest('section,div[data-view-name]');
        if(!p) p = title.parentElement;
        var html = (p?p:document.documentElement).innerHTML;
        var m = html.match(/urn:li:(?:fsd_)?(?:school|organization)[:_](\\d+)/);
        return m ? m[1] : null;
      })()`);
      console.log('  title附近ID:', titleId || '无');
    }
    
    return {success:true};
  }
});
