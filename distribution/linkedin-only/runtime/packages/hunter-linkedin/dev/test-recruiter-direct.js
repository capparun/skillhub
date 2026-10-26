import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-direct',
  access: 'read',
  description: '直接导航到搜索URL，测试结果加载',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: 'engineer', description: '搜索关键词' },
  ],
  func: async (page, kwargs) => {
    const { keyword } = kwargs;

    console.log('=== 直接导航到搜索 URL ===');
    const searchUrl = 'https://www.linkedin.com/talent/search?searchBoolean=' + encodeURIComponent(keyword) + '&start=0';
    console.log('URL: ' + searchUrl.substring(0, 80));
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    console.log('\n=== 循环检查状态 ===');
    for(var i=0; i<10; i++){
      await sleep(3000);
      var state = await page.evaluate(`(function(){
        var container = document.querySelector('#results-container');
        return {
          url: window.location.href,
          hasContainer: !!container,
          profileItems: container ? container.querySelectorAll('.profile-list-item').length : 0,
          lockups: container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0,
          hasLoading: document.body.innerText.indexOf('Loading') >= 0,
          hasStartSearch: document.body.innerText.indexOf('Start a search') >= 0
        };
      })()`);
      console.log(`[${i+1}] items=${state.profileItems} lockups=${state.lockups} Loading=${state.hasLoading} StartSearch=${state.hasStartSearch}`);
      if(state.profileItems > 0 || state.lockups > 0){
        console.log('  结果已出现！');
        break;
      }
    }

    return { success: true };
  }
});
