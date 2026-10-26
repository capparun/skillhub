import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-facet-ui',
  access: 'read',
  description: '诊断 facet 面板 UI 结构',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    console.log('=== 导航到搜索页 ===');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    console.log('\n=== 检查 facet 面板按钮 ===');
    var info = await page.evaluate(`(function(){
      var allBtns = Array.from(document.querySelectorAll('button'));
      var addBtns = allBtns.filter(b => {
        var aria = (b.getAttribute('aria-label') || '').toLowerCase();
        var text = (b.textContent || '').trim().toLowerCase();
        return aria.indexOf('add') >= 0 || text.indexOf('add') >= 0;
      }).map(b => ({
        ariaLabel: b.getAttribute('aria-label') || '',
        text: b.textContent.trim(),
        className: b.className.substring(0, 80)
      }));

      var filterBtns = allBtns.filter(b => {
        var text = (b.textContent || '').trim().toLowerCase();
        return text.indexOf('filter') >= 0 || text.indexOf('title') >= 0 || text.indexOf('location') >= 0;
      }).map(b => ({
        ariaLabel: b.getAttribute('aria-label') || '',
        text: b.textContent.trim(),
        className: b.className.substring(0, 80)
      }));

      return { addBtns: addBtns.slice(0, 10), filterBtns: filterBtns.slice(0, 10) };
    })()`);

    console.log('Add buttons (' + info.addBtns.length + '):');
    info.addBtns.forEach(b => console.log('  aria="' + b.ariaLabel + '" text="' + b.text + '"'));

    console.log('\nFilter-related buttons (' + info.filterBtns.length + '):');
    info.filterBtns.forEach(b => console.log('  aria="' + b.ariaLabel + '" text="' + b.text + '"'));

    return { success: true };
  }
});
