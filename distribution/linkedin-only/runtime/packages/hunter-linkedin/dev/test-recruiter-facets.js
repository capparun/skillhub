import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-facets',
  access: 'read',
  description: '深度探测 LinkedIn Recruiter 筛选面板结构',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== LinkedIn Recruiter 筛选面板深度探测 ===\n');

    // Step 1: 打开页面
    console.log('--- Step 1: 打开 /talent/search ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    const url = await page.evaluate('window.location.href');
    console.log(`URL: ${url}`);
    if (!url.includes('/talent/')) {
      console.log('❌ 未进入 Recruiter');
      return { success: false, error: 'not_recruiter' };
    }

    // Step 2: 扫描页面上的所有 h2/h3（找 facet section 标题）
    console.log('\n--- Step 2: 扫描 facet section 标题 ---');
    const headings = await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('h2, h3, [role="heading"]'));
      return all.map(function(el){
        return {
          tag: el.tagName,
          text: (el.textContent || '').trim(),
          ariaLevel: el.getAttribute('aria-level')
        };
      }).filter(function(h){ return h.text.length > 0 && h.text.length < 100; });
    })()`);
    console.log(`找到 ${headings.length} 个 heading:`);
    headings.forEach((h, i) => console.log(`  ${i + 1}. [${h.tag}] "${h.text}"`));

    // Step 3: 打开筛选面板
    console.log('\n--- Step 3: 打开筛选面板 ---');
    const panelBtn = await page.evaluate(`(function(){
      var btn = document.querySelector('.search-query-summary__edit-filters-btn');
      if (btn) return { found: true, text: (btn.textContent || '').trim(), class: btn.className };
      var all = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent || '').trim();
        if (t.indexOf('filters') >= 0 || t.indexOf('Filters') >= 0 || t.indexOf('筛选') >= 0) {
          return { found: true, text: t, class: all[i].className };
        }
      }
      return { found: false };
    })()`);
    console.log(`面板按钮: ${JSON.stringify(panelBtn)}`);

    if (panelBtn.found) {
      await page.evaluate(`(function(){
        var btn = document.querySelector('.search-query-summary__edit-filters-btn');
        if (btn) { btn.click(); return 'clicked_class'; }
        var all = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (var i = 0; i < all.length; i++) {
          var t = (all[i].textContent || '').trim();
          if (t.indexOf('filters') >= 0 || t.indexOf('Filters') >= 0) { all[i].click(); return 'clicked_text'; }
        }
        return 'not_found';
      })()`);
      await sleep(3000);
      console.log('面板已点击，等待 3s');
    }

    // Step 4: 扫描面板内的 section 结构
    console.log('\n--- Step 4: 扫描面板内 section 结构 ---');
    const sections = await page.evaluate(`(function(){
      var results = [];
      var allSections = document.querySelectorAll('section, [role="region"], .filter-section, .facet-section');
      for (var i = 0; i < allSections.length; i++) {
        var sec = allSections[i];
        var h2 = sec.querySelector('h2');
        var h3 = sec.querySelector('h3');
        var titleEl = h2 || h3 || sec.querySelector('[role="heading"]');
        var title = titleEl ? (titleEl.textContent || '').trim() : '';
        if (!title) continue;

        var buttons = Array.from(sec.querySelectorAll('button'));
        var buttonInfo = buttons.map(function(b){
          return {
            text: (b.textContent || '').trim().substring(0, 50),
            ariaLabel: (b.getAttribute('aria-label') || '').substring(0, 50),
            hasPlus: b.innerHTML.indexOf('plus') >= 0 || b.innerHTML.indexOf('add') >= 0
          };
        });

        var inputs = Array.from(sec.querySelectorAll('input'));
        var inputInfo = inputs.map(function(inp){
          return {
            type: inp.type,
            role: inp.getAttribute('role') || '',
            placeholder: (inp.placeholder || '').substring(0, 30)
          };
        });

        results.push({
          title: title,
          buttonCount: buttons.length,
          buttons: buttonInfo.slice(0, 3),
          inputCount: inputs.length,
          inputs: inputInfo.slice(0, 3)
        });
      }
      return results;
    })()`);

    console.log(`找到 ${sections.length} 个 section:`);
    sections.forEach((s, i) => {
      console.log(`\n  [${i + 1}] "${s.title}"`);
      console.log(`      按钮数: ${s.buttonCount}`);
      s.buttons.forEach((b, j) => {
        console.log(`        按钮${j + 1}: text="${b.text}" aria-label="${b.ariaLabel}" hasPlus=${b.hasPlus}`);
      });
      console.log(`      输入框数: ${s.inputCount}`);
      s.inputs.forEach((inp, j) => {
        console.log(`        输入${j + 1}: type=${inp.type} role=${inp.role} placeholder="${inp.placeholder}"`);
      });
    });

    // Step 5: 对整个面板做更粗粒度的扫描（兜底）
    console.log('\n--- Step 5: 面板兜底扫描 ---');
    const panelScan = await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('*'));
      var interesting = [];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var tag = el.tagName.toLowerCase();
        if (tag === 'input' && (el.getAttribute('role') === 'combobox' || el.type === 'text')) {
          var rect = el.getBoundingClientRect();
          if (rect.width > 50) {
            interesting.push({
              type: 'input',
              role: el.getAttribute('role') || el.type,
              placeholder: (el.placeholder || '').substring(0, 30),
              parentText: (el.parentElement ? (el.parentElement.textContent || '').trim().substring(0, 50) : '')
            });
          }
        }
        if (tag === 'button') {
          var rect = el.getBoundingClientRect();
          if (rect.width > 20) {
            var txt = (el.textContent || '').trim();
            var label = el.getAttribute('aria-label') || '';
            if (txt.indexOf('Add') >= 0 || label.indexOf('Add') >= 0 || txt.indexOf('add') >= 0) {
              interesting.push({
                type: 'button-add',
                text: txt.substring(0, 30),
                ariaLabel: label.substring(0, 50)
              });
            }
          }
        }
      }
      return interesting;
    })()`);

    console.log(`找到 ${panelScan.length} 个交互元素:`);
    panelScan.forEach((el, i) => {
      if (el.type === 'input') {
        console.log(`  [${i + 1}] input: role=${el.role} placeholder="${el.placeholder}" near="${el.parentText}"`);
      } else {
        console.log(`  [${i + 1}] button: text="${el.text}" aria-label="${el.ariaLabel}"`);
      }
    });

    // Step 6: 尝试找一个 Add 按钮点击，看 typeahead 是否出现
    console.log('\n--- Step 6: 尝试点击第一个 Add 按钮 ---');
    const addResult = await page.evaluate(`(function(){
      var allBtns = Array.from(document.querySelectorAll('button'));
      for (var i = 0; i < allBtns.length; i++) {
        var label = (allBtns[i].getAttribute('aria-label') || '').toLowerCase();
        var text = (allBtns[i].textContent || '').trim().toLowerCase();
        if (label.indexOf('add') >= 0 || text.indexOf('add') >= 0) {
          allBtns[i].click();
          return { clicked: true, text: text, ariaLabel: label, index: i };
        }
      }
      return { clicked: false };
    })()`);
    console.log(`点击结果: ${JSON.stringify(addResult)}`);

    if (addResult.clicked) {
      await sleep(2000);
      const inputsAfter = await page.evaluate(`(function(){
        var inputs = document.querySelectorAll('input[role="combobox"], input[type="text"]');
        return Array.from(inputs).map(function(inp){
          return {
            value: inp.value,
            placeholder: inp.placeholder || '',
            visible: inp.offsetParent !== null
          };
        });
      })()`);
      console.log(`点击后出现的输入框: ${JSON.stringify(inputsAfter)}`);
    }

    console.log('\n=== 探测完成 ===');
    return { success: true, sections: sections.length };
  }
});
