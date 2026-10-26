import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-sf2', access: 'read', description: 'test schoolFilter param',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    // 用户提供的 URL
    const url = 'https://www.linkedin.com/search/results/people/?keywords=software%20engineer&origin=FACETED_SEARCH&geoUrn=%5B%22103644278%22%2C%22102890883%22%2C%22102095887%22%5D&schoolFilter=%5B%221792%22%2C%2214022%22%5D';
    console.log('访问:', url);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(8000);
    
    const actual = await page.evaluate('window.location.href');
    console.log('\n实际URL:', actual);
    
    const cards = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('a[href*="/in/"]')).map(a=>a.textContent.trim()).filter(t=>t.includes('•')).slice(0,5);
    })()`);
    console.log('\n前5个结果:');
    cards.forEach((c,i) => console.log(`  ${i+1}. ${c.substring(0,130)}`));
    
    // 检查 URL 是否保留了 schoolFilter
    const hasSchool = actual.includes('schoolFilter');
    console.log(`\nschoolFilter保留: ${hasSchool}`);
    
    return {success:true};
  }
});
