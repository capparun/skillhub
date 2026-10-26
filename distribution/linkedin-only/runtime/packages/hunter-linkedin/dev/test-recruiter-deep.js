import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getUrl(page) {
  return page.evaluate('window.location.href');
}

async function getState(page, label) {
  const url = await getUrl(page);
  const search = await page.evaluate('(function(){ var el = document.querySelector("#system-search-typeahead"); return el ? (el.value || el.textContent || "") : "未找到"; })()');
  const pills = await page.evaluate('(function(){ var tags = document.querySelectorAll(".search-query-summary__filter-pill, .filter-pill"); return Array.from(tags).map(function(t){ return t.textContent ? t.textContent.trim() : ""; }).filter(function(t){ return t.length > 0; }); })()');
  const cards = await page.evaluate('(function(){ var c = document.querySelectorAll("#results-container .profile-list-item, ol.profile-list li"); return c.length; })()');
  console.log(`  [${label}] URL: ${url}`);
  console.log(`  [${label}] 搜索框: "${search}"`);
  console.log(`  [${label}] 筛选标签: ${pills.length > 0 ? pills.join(' | ') : '无'}`);
  console.log(`  [${label}] 结果卡片: ${cards}`);
  return { url, search, pills, cards };
}

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-deep',
  access: 'read',
  description: '深度探测 LinkedIn Recruiter 各 facet 交互细节',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== LinkedIn Recruiter 深度探测 ===\n');

    // ===== Step 1: 打开页面 =====
    console.log('--- Step 1: 打开 /talent/search ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    const url = await getUrl(page);
    if (!url.includes('/talent/')) {
      console.log('❌ 未进入 Recruiter');
      return { success: false, error: 'not_recruiter' };
    }
    await getState(page, '初始');

    // ===== Step 2: 打开筛选面板 =====
    console.log('\n--- Step 2: 打开筛选面板 ---');
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(3000);
    await getState(page, '面板打开后');

    // ===== Step 3: 扫描面板内所有可点击的 Add 按钮 =====
    console.log('\n--- Step 3: 扫描所有 Add 按钮 ---');
    const addButtons = await page.evaluate(`(function(){
      var all = Array.from(document.querySelectorAll('button'));
      var results = [];
      for (var i = 0; i < all.length; i++) {
        var label = (all[i].getAttribute('aria-label') || '').toLowerCase();
        var text = (all[i].textContent || '').trim();
        if (label.indexOf('add') >= 0 || text.toLowerCase().indexOf('add') >= 0) {
          // 找到最近的 h2 作为 section 标题
          var el = all[i];
          var sectionTitle = '';
          for (var d = 0; d < 10; d++) {
            if (!el) break;
            var h2 = el.querySelector('h2');
            if (!h2 && el.parentElement) {
              var parentH2 = el.parentElement.querySelector('h2');
              if (parentH2) h2 = parentH2;
            }
            if (h2) {
              sectionTitle = (h2.textContent || '').trim();
              break;
            }
            el = el.parentElement;
          }
          results.push({
            index: i,
            text: text.substring(0, 60),
            ariaLabel: all[i].getAttribute('aria-label') || '',
            sectionTitle: sectionTitle,
            className: all[i].className.substring(0, 80)
          });
        }
      }
      return results;
    })()`);

    console.log(`找到 ${addButtons.length} 个 Add 按钮:`);
    addButtons.forEach((b, i) => {
      console.log(`  [${i}] section="${b.sectionTitle}" text="${b.text}" aria-label="${b.ariaLabel}"`);
    });

    // ===== Step 4: 逐个 facet 测试交互 =====
    console.log('\n--- Step 4: 逐个测试 facet 交互 ---');

    // 定义要测试的 facet，用 sectionTitle 匹配
    const facetsToTest = [
      { name: 'Job titles', testValue: 'Architect' },
      { name: 'Locations', testValue: 'Shenzhen' },
      { name: 'Skills and Assessments', testValue: 'Python' },
      { name: 'Companies', testValue: 'Google' },
      { name: 'Keywords', testValue: 'machine learning' },
    ];

    for (const facet of facetsToTest) {
      console.log(`\n>> 测试 facet: ${facet.name}`);

      // 找到对应的 Add 按钮并点击
      const clickResult = await page.evaluate(`(function(){
        var all = Array.from(document.querySelectorAll('button'));
        for (var i = 0; i < all.length; i++) {
          var label = (all[i].getAttribute('aria-label') || '').toLowerCase();
          var text = (all[i].textContent || '').trim().toLowerCase();
          var sectionTitle = '';
          var el = all[i];
          for (var d = 0; d < 10; d++) {
            if (!el) break;
            var h2 = el.querySelector('h2');
            if (!h2 && el.parentElement) {
              var parentH2 = el.parentElement.querySelector('h2');
              if (parentH2) h2 = parentH2;
            }
            if (h2) {
              sectionTitle = (h2.textContent || '').trim();
              break;
            }
            el = el.parentElement;
          }
          if (sectionTitle.indexOf('${facet.name.replace(/'/g, "\\'")}') >= 0) {
            if (label.indexOf('add') >= 0 || text.indexOf('add') >= 0) {
              all[i].click();
              return { clicked: true, sectionTitle: sectionTitle, buttonText: text };
            }
          }
        }
        return { clicked: false };
      })()`);
      console.log(`  点击 Add: ${JSON.stringify(clickResult)}`);

      if (!clickResult.clicked) {
        console.log(`  ❌ 未找到 ${facet.name} 的 Add 按钮`);
        continue;
      }

      await sleep(1500);

      // 记录点击后出现的输入框
      const inputs = await page.evaluate(`(function(){
        var allInputs = document.querySelectorAll('input[role="combobox"], input[type="text"]');
        return Array.from(allInputs).map(function(inp){
          return {
            placeholder: inp.placeholder || '',
            value: inp.value || '',
            visible: inp.offsetParent !== null,
            width: inp.offsetWidth
          };
        }).filter(function(inp){ return inp.visible && inp.width > 50; });
      })()`);
      console.log(`  出现的输入框: ${JSON.stringify(inputs)}`);

      // 输入测试值
      const inputIndex = inputs.length - 1; // 通常最后一个是刚出现的
      if (inputs.length > 0) {
        await page.evaluate(`(function(){
          var allInputs = document.querySelectorAll('input[role="combobox"], input[type="text"]');
          var target = null;
          for (var i = allInputs.length - 1; i >= 0; i--) {
            if (allInputs[i].offsetParent !== null && allInputs[i].offsetWidth > 50) {
              target = allInputs[i];
              break;
            }
          }
          if (target) {
            target.focus();
            target.value = '${facet.testValue.replace(/'/g, "\\'")}';
            target.dispatchEvent(new Event('input', { bubbles: true }));
            return { found: true, placeholder: target.placeholder };
          }
          return { found: false };
        })()`);
        console.log(`  已输入: "${facet.testValue}"`);

        await sleep(2000);

        // 检查下拉选项
        const options = await page.evaluate(`(function(){
          var opts = document.querySelectorAll('li[role="option"]');
          return Array.from(opts).map(function(o){
            return (o.textContent || '').trim();
          }).filter(function(t){ return t.length > 0; }).slice(0, 5);
        })()`);
        console.log(`  下拉选项(${options.length}个): ${JSON.stringify(options)}`);

        // 点击第一个选项
        if (options.length > 0) {
          await page.evaluate(`(function(){
            var opts = document.querySelectorAll('li[role="option"]');
            if (opts.length > 0) opts[0].click();
          })()`);
          console.log(`  点击了第一个选项`);
          await sleep(3000);

          // 记录状态变化
          await getState(page, `${facet.name} 添加后`);

          // 检查是否还能继续添加（同一 facet 多选）
          const canAddMore = await page.evaluate(`(function(){
            var all = Array.from(document.querySelectorAll('button'));
            for (var i = 0; i < all.length; i++) {
              var label = (all[i].getAttribute('aria-label') || '').toLowerCase();
              var text = (all[i].textContent || '').trim().toLowerCase();
              var sectionTitle = '';
              var el = all[i];
              for (var d = 0; d < 10; d++) {
                if (!el) break;
                var h2 = el.querySelector('h2');
                if (!h2 && el.parentElement) {
                  var parentH2 = el.parentElement.querySelector('h2');
                  if (parentH2) h2 = parentH2;
                }
                if (h2) {
                  sectionTitle = (h2.textContent || '').trim();
                  break;
                }
                el = el.parentElement;
              }
              if (sectionTitle.indexOf('${facet.name.replace(/'/g, "\\'")}') >= 0) {
                if (label.indexOf('add') >= 0 || text.indexOf('add') >= 0) {
                  return { canAdd: true, buttonText: text };
                }
              }
            }
            return { canAdd: false };
          })()`);
          console.log(`  是否可继续添加: ${JSON.stringify(canAddMore)}`);
        } else {
          console.log(`  ⚠️ 无下拉选项，按 Enter 回退`);
          await page.evaluate(`(function(){
            var allInputs = document.querySelectorAll('input[role="combobox"], input[type="text"]');
            var target = null;
            for (var i = allInputs.length - 1; i >= 0; i--) {
              if (allInputs[i].offsetParent !== null) { target = allInputs[i]; break; }
            }
            if (target) {
              var e = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true });
              target.dispatchEvent(e);
            }
          })()`);
          await sleep(3000);
          await getState(page, `${facet.name} Enter回车后`);
        }
      } else {
        console.log(`  ⚠️ 未找到输入框`);
      }
    }

    // ===== Step 5: 测试搜索提交 =====
    console.log('\n--- Step 5: 测试主搜索框提交 ---');
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if (el) {
        el.focus();
        el.value = 'robotics engineer';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await sleep(500);
    await page.evaluate(`(function(){
      var el = document.querySelector('#system-search-typeahead');
      if (el) {
        var e = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true });
        el.dispatchEvent(e);
      }
    })()`);
    await sleep(4000);
    await getState(page, '主搜索提交后');

    // ===== Step 6: 检查分页 =====
    console.log('\n--- Step 6: 检查分页按钮 ---');
    const pagination = await page.evaluate(`(function(){
      var nextBtn = document.querySelector('.artdeco-pagination__button--next');
      var allBtns = Array.from(document.querySelectorAll('button'));
      var nextByLabel = null;
      for (var i = 0; i < allBtns.length; i++) {
        var label = (allBtns[i].getAttribute('aria-label') || '').toLowerCase();
        if (label.indexOf('next') >= 0) {
          nextByLabel = { text: (allBtns[i].textContent || '').trim(), ariaLabel: label };
          break;
        }
      }
      return {
        hasNextClass: !!nextBtn,
        nextByLabel: nextByLabel,
        totalButtons: allBtns.length
      };
    })()`);
    console.log(`  分页信息: ${JSON.stringify(pagination)}`);

    // ===== Step 7: 检查结果卡片结构 =====
    console.log('\n--- Step 7: 检查结果卡片结构 ---');
    const cardStructure = await page.evaluate(`(function(){
      var cards = document.querySelectorAll('#results-container .profile-list-item, ol.profile-list li');
      if (cards.length === 0) return { found: 0 };
      var first = cards[0];
      return {
        found: cards.length,
        name: (first.querySelector('.artdeco-entity-lockup__title')?.textContent || '').trim(),
        headline: (first.querySelector('.artdeco-entity-lockup__subtitle')?.textContent || '').trim(),
        location: (first.querySelector('.artdeco-entity-lockup__metadata')?.textContent || '').trim(),
        degree: (first.querySelector('.artdeco-entity-lockup__badge')?.textContent || '').trim(),
        hasProfileLink: !!first.querySelector('a[href*="/in/"]'),
        workHistoryItems: first.querySelectorAll('li.t-14.t-black.t-normal').length
      };
    })()`);
    console.log(`  卡片结构: ${JSON.stringify(cardStructure)}`);

    console.log('\n=== 深度探测完成 ===');
    return { success: true };
  }
});
