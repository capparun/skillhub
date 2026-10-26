import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-native',
  access: 'read',
  description: '用 opencli 原生方法测试 Recruiter 搜索触发',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== opencli 原生方法探测 ===\n');

    // 测试1: page.type + page.press 搜索框
    console.log('--- 测试1: page.type + page.press 搜索框 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    try {
      await page.type('#system-search-typeahead', 'software engineer');
      console.log('  page.type 成功');
      await sleep(1000);

      await page.press('#system-search-typeahead', 'Enter');
      console.log('  page.press Enter 成功');
      await sleep(5000);

      const state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, hasLoading: b.indexOf("Loading") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
      console.log(`  结果: ${JSON.stringify(state)}`);
    } catch (e) {
      console.log(`  错误: ${e.message}`);
    }

    // 测试2: page.click 点击 Job titles Add 按钮
    console.log('\n--- 测试2: page.click 点击 Job titles Add ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    // 打开面板
    try {
      await page.click('.search-query-summary__edit-filters-btn');
      console.log('  点击面板按钮成功');
    } catch (e) {
      console.log(`  点击面板按钮失败: ${e.message}`);
    }
    await sleep(2000);

    // 找到 Job titles Add 按钮并点击
    const jobTitleBtn = await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("job titles")>=0 && label.indexOf("add")>=0){ return { found: true, index: i, label: label, text: (all[i].textContent||"").trim() }; } } return { found: false }; })()');
    console.log(`  Job titles 按钮: ${JSON.stringify(jobTitleBtn)}`);

    if (jobTitleBtn.found) {
      try {
        // 用 nth-child 或通用选择器来定位
        await page.click(`button:nth-of-type(${jobTitleBtn.index + 1})`);
        console.log('  page.click Job titles Add 成功');
      } catch (e) {
        console.log(`  page.click 失败: ${e.message}，回退到 evaluate`);
        await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("job titles")>=0 && label.indexOf("add")>=0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
      }
      await sleep(2000);

      // type 输入
      try {
        const inputs = await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var vis = []; for(var i=0;i<inputs.length;i++){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50) vis.push({index:i, ph:inputs[i].placeholder||""}); } return vis; })()');
        console.log(`  可见输入框: ${JSON.stringify(inputs)}`);

        if (inputs.length > 0) {
          // 尝试用 page.type 输入到最后一个可见输入框
          const lastInput = inputs[inputs.length - 1];
          await page.type(`input:nth-of-type(${lastInput.index + 1})`, 'Architect');
          console.log('  page.type 输入成功');
          await sleep(3000);

          // 点击第一个 option
          const hasOption = await page.evaluate('(function(){ return document.querySelectorAll("li[role=option]").length > 0; })()');
          if (hasOption) {
            await page.click('li[role="option"]:first-child');
            console.log('  page.click option 成功');
          } else {
            await page.press(`input:nth-of-type(${lastInput.index + 1})`, 'Enter');
            console.log('  page.press Enter 回退');
          }
          await sleep(5000);

          const state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, hasLoading: b.indexOf("Loading") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
          console.log(`  结果: ${JSON.stringify(state)}`);
        }
      } catch (e) {
        console.log(`  输入错误: ${e.message}`);
      }
    }

    // 测试3: page.click 点击搜索框然后 type
    console.log('\n--- 测试3: page.click 搜索框 -> type -> press Enter ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    try {
      await page.click('#system-search-typeahead');
      console.log('  page.click 搜索框成功');
      await sleep(500);

      await page.type('#system-search-typeahead', 'engineer');
      console.log('  page.type 成功');
      await sleep(1000);

      await page.press('#system-search-typeahead', 'Enter');
      console.log('  page.press Enter 成功');
      await sleep(5000);

      const state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
      console.log(`  结果: ${JSON.stringify(state)}`);
    } catch (e) {
      console.log(`  错误: ${e.message}`);
    }

    // 测试4: 检查 opencli page 支持哪些方法
    console.log('\n--- 测试4: page 对象方法列表 ---');
    const methods = await page.evaluate('(function(){ return Object.keys(window).filter(function(k){ return k.indexOf("page") >= 0; }).slice(0,20); })()');
    console.log(`  window 上含 page 的键: ${JSON.stringify(methods)}`);

    console.log('\n=== 探测完成 ===');
    return { success: true };
  }
});
