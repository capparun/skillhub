import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-ghost',
  access: 'read',
  description: '诊断 ghost loader 和页面超时行为',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page, kwargs) => {
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    // 持续监控 60s
    for(let i=0; i<12; i++){
      await sleep(5000);
      var state = await page.evaluate(`(function(){
        var container = document.querySelector('#results-container');
        var lockups = container ? container.querySelectorAll('.artdeco-entity-lockup') : [];
        var ghosts = container ? container.querySelectorAll('[data-test-ghost-row-entity-lockup-img]') : [];
        var realCards = container ? container.querySelectorAll('.artdeco-entity-lockup__title a') : [];
        var bodyText = document.body.innerText.substring(0, 200);
        var hasError = bodyText.indexOf('error') >= 0 || bodyText.indexOf('Error') >= 0;
        var hasTimeout = bodyText.indexOf('timeout') >= 0 || bodyText.indexOf('Timeout') >= 0;

        return {
          url: window.location.href,
          lockups: lockups.length,
          ghosts: ghosts.length,
          realCards: realCards.length,
          bodySnippet: bodyText,
          hasError: hasError,
          hasTimeout: hasTimeout,
          resultsContainerExists: !!container
        };
      })()`);
      console.log(`${(i+1)*5}s: url=${state.url.substring(0,60)}, lockups=${state.lockups}, ghosts=${state.ghosts}, realCards=${state.realCards}, hasError=${state.hasError}`);
      if(state.bodySnippet && !state.bodySnippet.includes('Loading')){
        console.log('  body:', state.bodySnippet.substring(0, 100));
      }
    }

    return { success: true };
  }
});
