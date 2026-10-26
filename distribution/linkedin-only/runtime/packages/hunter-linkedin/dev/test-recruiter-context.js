import { cli, Strategy } from '@jackwener/opencli/registry';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-context',
  access: 'read',
  description: '测试 searchContextId URL 是否保留筛选条件',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    const url = 'https://www.linkedin.com/talent/search?searchContextId=d59e1bcf-7c6a-47a6-bc45-4d97419f7f82&searchHistoryId=20998111266&searchRequestId=54df0b48-2d3e-4bc7-9244-aa4e22d88be8&start=0&uiOrigin=HISTORY_SEARCH';

    console.log('导航到历史搜索 URL...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // 激活 Chrome
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 3000 });
    } catch(e) {}
    await sleep(3000);

    // 检查页面状态
    var state = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        title: document.title,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(p => p.textContent.trim()),
        totalText: (document.querySelector('.profile-list__header-info-text') || {}).textContent || '',
        searchBox: (document.querySelector('#system-search-typeahead') || {}).value || ''
      };
    })()`);
    console.log('页面状态:', JSON.stringify(state, null, 2));

    // 等待结果加载
    await sleep(5000);

    // 检查卡片
    var cards = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
      return { lockups: lockups.length, realCards: realCards.length };
    })()`);
    console.log('卡片:', JSON.stringify(cards));

    // 提取前3个卡片的 headline
    var headlines = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
      return Array.from(lockups).slice(0, 3).map(function(l){
        var subtitle = l.querySelector('.artdeco-entity-lockup__subtitle');
        var loc = l.querySelector('.artdeco-entity-lockup__metadata');
        return {
          name: (l.querySelector('.artdeco-entity-lockup__title') || {}).textContent || '',
          headline: subtitle ? subtitle.textContent.trim() : '',
          location: loc ? loc.textContent.trim().substring(0, 80) : ''
        };
      });
    })()`);
    console.log('前3个候选人:', JSON.stringify(headlines, null, 2));

    return { success: true };
  }
});
