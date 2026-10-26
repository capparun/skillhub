import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'hunter-linkedin',
  name: 'test-check-alive',
  access: 'read',
  description: '检查当前标签页是否存活',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    var state = await page.evaluate(`(function(){
      return {
        url: window.location.href,
        title: document.title,
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        readyState: document.readyState,
        hasBody: !!document.body,
        bodyText: document.body ? document.body.innerText.substring(0, 200) : 'no body'
      };
    })()`);
    console.log('页面状态:', JSON.stringify(state, null, 2));

    // 检查 results container
    var cards = await page.evaluate(`(function(){
      var container = document.querySelector('#results-container');
      return {
        containerFound: !!container,
        lockups: container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0,
        totalText: (document.querySelector('.profile-list__header-info-text') || {}).textContent || ''
      };
    })()`);
    console.log('卡片状态:', JSON.stringify(cards));

    return { success: true, state: state, cards: cards };
  }
});
