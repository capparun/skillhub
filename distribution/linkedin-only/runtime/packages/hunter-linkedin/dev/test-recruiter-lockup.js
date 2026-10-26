import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-lockup',
  access: 'read',
  description: '诊断 lockup 结构',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 导航到搜索页 ===');
    const searchUrl = 'https://www.linkedin.com/talent/search?searchBoolean=' + encodeURIComponent(keyword) + '&start=0';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    console.log('\n=== 检查 lockup 结构 ===');
    var info = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      if(!container) return {error: 'no container'};
      var lockups = container.querySelectorAll('.artdeco-entity-lockup');
      var results = [];
      for(var i=0; i<Math.min(lockups.length, 3); i++){
        var l = lockups[i];
        var titleA = l.querySelector('.artdeco-entity-lockup__title a');
        var subtitle = l.querySelector('.artdeco-entity-lockup__subtitle');
        var meta = l.querySelector('.artdeco-entity-lockup__metadata');
        var badge = l.querySelector('.artdeco-entity-lockup__badge');
        results.push({
          index: i,
          html: l.outerHTML.substring(0, 800),
          titleText: titleA ? titleA.textContent.trim() : '',
          titleHref: titleA ? titleA.href : '',
          subtitleText: subtitle ? subtitle.textContent.trim() : '',
          metaText: meta ? meta.textContent.trim() : '',
          badgeText: badge ? badge.textContent.trim() : '',
          allLinks: Array.from(l.querySelectorAll('a')).map(a => ({href: a.href, text: a.textContent.trim()})).slice(0, 5),
          allText: l.innerText.substring(0, 200)
        });
      }
      return {count: lockups.length, samples: results};
    })()`);

    console.log('Lockups 总数: ' + info.count);
    if(info.samples){
      info.samples.forEach(s => {
        console.log('\n--- Lockup ' + s.index + ' ---');
        console.log('  名字: ' + s.titleText);
        console.log('  链接: ' + s.titleHref);
        console.log('  副标题: ' + s.subtitleText);
        console.log('  元数据: ' + s.metaText);
        console.log('  徽章: ' + s.badgeText);
        console.log('  所有链接: ' + JSON.stringify(s.allLinks));
        console.log('  全部文本: ' + s.allText);
        console.log('  HTML片段: ' + s.html.substring(0, 300));
      });
    }

    return { success: true };
  }
});
