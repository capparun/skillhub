import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getUrl(page) {
  return page.evaluate('window.location.href');
}

async function getSearchValue(page) {
  return page.evaluate('(function(){ var el = document.querySelector(\'#system-search-typeahead\'); return el ? (el.value || el.textContent || \'\') : \'未找到\'; })()');
}

async function getFilterPills(page) {
  return page.evaluate('(function(){ var tags = document.querySelectorAll(\'.search-query-summary__filter-pill, .filter-pill, .search-filter-tag, [data-control-name="filter_pill"]\'); return Array.from(tags).map(function(t){ return t.textContent ? t.textContent.trim() : \'\'; }).filter(function(t){ return t.length > 0; }); })()');
}

async function getResultCount(page) {
  return page.evaluate('(function(){ var cards = document.querySelectorAll(\'#results-container .profile-list-item, ol.profile-list li, [data-control-name="search_result"]\'); return cards.length; })()');
}

async function logState(page, label) {
  const url = await getUrl(page);
  const search = await getSearchValue(page);
  const pills = await getFilterPills(page);
  const count = await getResultCount(page);
  console.log(`  URL: ${url}`);
  console.log(`  搜索框: "${search}"`);
  console.log(`  筛选标签: ${pills.length > 0 ? pills.join(' | ') : '无'}`);
  console.log(`  结果数: ${count}`);
}

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-url',
  access: 'read',
  description: '探测 LinkedIn Recruiter URL 参数支持情况',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== LinkedIn Recruiter URL 参数探测 ===');
    console.log('策略: 先操作 UI，再观察 URL 变化\n');

    // Step 1: 打开基础页面
    console.log('--- Step 1: 打开 /talent/search (无参数) ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await logState(page, '初始状态');

    const baseUrl = await getUrl(page);
    if (!baseUrl.includes('/talent/')) {
      console.log('\n❌ 未进入 Recruiter 页面，请确认已登录且有权限');
      return { success: false, error: 'not_recruiter' };
    }

    // Step 2: 在搜索框输入关键词
    console.log('\n--- Step 2: 搜索框输入 "software engineer" ---');
    await page.evaluate('(function(){ var el = document.querySelector(\'#system-search-typeahead\'); if(el){ el.focus(); el.select(); } })()');
    await sleep(500);
    await page.evaluate('(function(){ var el = document.querySelector(\'#system-search-typeahead\'); if(el){ el.value = "software engineer"; el.dispatchEvent(new Event(\'input\', { bubbles: true })); } })()');
    await sleep(500);
    await page.evaluate('(function(){ var el = document.querySelector(\'#system-search-typeahead\'); if(el){ var e = new KeyboardEvent(\'keydown\', { key: \'Enter\', keyCode: 13, bubbles: true }); el.dispatchEvent(e); } })()');
    await sleep(4000);
    await logState(page, '输入关键词后');

    // Step 3: 打开筛选面板
    console.log('\n--- Step 3: 打开筛选面板 ---');
    const panelOpened = await page.evaluate('(function(){ var btn = document.querySelector(\'.search-query-summary__edit-filters-btn\'); if(btn){ btn.click(); return true; } var all = Array.from(document.querySelectorAll(\'*\')); for(var i=0;i<all.length;i++){ var t = (all[i].textContent||\'\').trim(); if(t===\'Show filters\' || t===\'Edit filters\' || t.indexOf(\'filters\')>=0){ all[i].click(); return true; } } return false; })()');
    console.log(`  面板按钮找到并点击: ${panelOpened}`);
    await sleep(3000);
    await logState(page, '打开面板后');

    // Step 4: 添加 Job title 筛选
    console.log('\n--- Step 4: 添加 Job title = "Architect" ---');
    const titleAdded = await page.evaluate('(function(){ var sections = Array.from(document.querySelectorAll(\'h2, h3\')); var section = null; for(var i=0;i<sections.length;i++){ var t = (sections[i].textContent||\'\').trim(); if(t.indexOf(\'Job titles\')>=0 || t.indexOf(\'Job title\')>=0){ section = sections[i]; break; } } if(!section) return \'section_not_found\'; var container = section.closest(\'section, div[class*="filter"], div[class*="facet"]\') || section.parentElement; var addBtn = container.querySelector(\'button[aria-label*="Add"], button svg[class*="plus"], button[type="button"]\'); if(addBtn){ addBtn.click(); return \'clicked_add\'; } var btns = container.querySelectorAll(\'button\'); for(var i=0;i<btns.length;i++){ var label = (btns[i].getAttribute(\'aria-label\')||\'\').toLowerCase(); if(label.indexOf(\'add\')>=0 || label.indexOf(\'job\')>=0){ btns[i].click(); return \'clicked_by_label\'; } } return \'add_btn_not_found\'; })()');
    console.log(`  添加结果: ${titleAdded}`);
    await sleep(2000);

    // 输入 typeahead
    await page.evaluate('(function(){ var inputs = document.querySelectorAll(\'input[role="combobox"], input[type="text"]\'); var input = null; for(var i=0;i<inputs.length;i++){ if(inputs[i].placeholder && inputs[i].placeholder.indexOf(\'title\')>=0){ input = inputs[i]; break; } } if(!input && inputs.length>0) input = inputs[inputs.length-1]; if(input){ input.focus(); input.value = "Architect"; input.dispatchEvent(new Event(\'input\', { bubbles: true })); } })()');
    await sleep(2000);

    // 点击第一个 option
    await page.evaluate('(function(){ var options = document.querySelectorAll(\'li[role="option"]\'); if(options.length>0){ options[0].click(); return \'clicked_option_0\'; } return \'no_options\'; })()');
    await sleep(3000);
    await logState(page, '添加 Job title 后');

    // Step 5: 添加 Location 筛选
    console.log('\n--- Step 5: 添加 Location = "Shenzhen" ---');
    const locAdded = await page.evaluate('(function(){ var sections = Array.from(document.querySelectorAll(\'h2, h3\')); var section = null; for(var i=0;i<sections.length;i++){ var t = (sections[i].textContent||\'\').trim(); if(t.indexOf(\'Locations\')>=0 || t.indexOf(\'Location\')>=0){ section = sections[i]; break; } } if(!section) return \'section_not_found\'; var container = section.closest(\'section, div[class*="filter"], div[class*="facet"]\') || section.parentElement; var addBtn = container.querySelector(\'button[aria-label*="Add"], button svg[class*="plus"]\'); if(addBtn){ addBtn.click(); return \'clicked_add\'; } var btns = container.querySelectorAll(\'button\'); for(var i=0;i<btns.length;i++){ var label = (btns[i].getAttribute(\'aria-label\')||\'\').toLowerCase(); if(label.indexOf(\'add\')>=0 || label.indexOf(\'location\')>=0){ btns[i].click(); return \'clicked_by_label\'; } } return \'add_btn_not_found\'; })()');
    console.log(`  添加结果: ${locAdded}`);
    await sleep(2000);

    await page.evaluate('(function(){ var inputs = document.querySelectorAll(\'input[role="combobox"], input[type="text"]\'); var input = null; for(var i=0;i<inputs.length;i++){ if(inputs[i].placeholder && inputs[i].placeholder.indexOf(\'location\')>=0){ input = inputs[i]; break; } } if(!input && inputs.length>0) input = inputs[inputs.length-1]; if(input){ input.focus(); input.value = "Shenzhen"; input.dispatchEvent(new Event(\'input\', { bubbles: true })); } })()');
    await sleep(2000);

    await page.evaluate('(function(){ var options = document.querySelectorAll(\'li[role="option"]\'); if(options.length>0){ options[0].click(); return \'clicked_option_0: "\' + (options[0].textContent||\'\').trim() + \'"\'; } return \'no_options\'; })()');
    await sleep(3000);
    await logState(page, '添加 Location 后');

    // Step 6: 添加 Company 筛选
    console.log('\n--- Step 6: 添加 Company = "Google" ---');
    const compAdded = await page.evaluate('(function(){ var sections = Array.from(document.querySelectorAll(\'h2, h3\')); var section = null; for(var i=0;i<sections.length;i++){ var t = (sections[i].textContent||\'\').trim(); if(t.indexOf(\'Companies\')>=0 || t.indexOf(\'Company\')>=0){ section = sections[i]; break; } } if(!section) return \'section_not_found\'; var container = section.closest(\'section, div[class*="filter"], div[class*="facet"]\') || section.parentElement; var addBtn = container.querySelector(\'button[aria-label*="Add"], button svg[class*="plus"]\'); if(addBtn){ addBtn.click(); return \'clicked_add\'; } var btns = container.querySelectorAll(\'button\'); for(var i=0;i<btns.length;i++){ var label = (btns[i].getAttribute(\'aria-label\')||\'\').toLowerCase(); if(label.indexOf(\'add\')>=0 || label.indexOf(\'company\')>=0){ btns[i].click(); return \'clicked_by_label\'; } } return \'add_btn_not_found\'; })()');
    console.log(`  添加结果: ${compAdded}`);
    await sleep(2000);

    await page.evaluate('(function(){ var inputs = document.querySelectorAll(\'input[role="combobox"], input[type="text"]\'); var input = null; for(var i=0;i<inputs.length;i++){ if(inputs[i].placeholder && inputs[i].placeholder.indexOf(\'company\')>=0){ input = inputs[i]; break; } } if(!input && inputs.length>0) input = inputs[inputs.length-1]; if(input){ input.focus(); input.value = "Google"; input.dispatchEvent(new Event(\'input\', { bubbles: true })); } })()');
    await sleep(2000);

    await page.evaluate('(function(){ var options = document.querySelectorAll(\'li[role="option"]\'); if(options.length>0){ options[0].click(); return \'clicked_option_0: "\' + (options[0].textContent||\'\').trim() + \'"\'; } return \'no_options\'; })()');
    await sleep(3000);
    await logState(page, '添加 Company 后');

    // Step 7: 添加 Keywords 筛选
    console.log('\n--- Step 7: 添加 Keywords = "python" ---');
    const kwAdded = await page.evaluate('(function(){ var sections = Array.from(document.querySelectorAll(\'h2, h3\')); var section = null; for(var i=0;i<sections.length;i++){ var t = (sections[i].textContent||\'\').trim(); if(t.indexOf(\'Keywords\')>=0 || t.indexOf(\'Keyword\')>=0){ section = sections[i]; break; } } if(!section) return \'section_not_found\'; var container = section.closest(\'section, div[class*="filter"], div[class*="facet"]\') || section.parentElement; var addBtn = container.querySelector(\'button[aria-label*="Add"], button svg[class*="plus"]\'); if(addBtn){ addBtn.click(); return \'clicked_add\'; } var btns = container.querySelectorAll(\'button\'); for(var i=0;i<btns.length;i++){ var label = (btns[i].getAttribute(\'aria-label\')||\'\').toLowerCase(); if(label.indexOf(\'add\')>=0 || label.indexOf(\'keyword\')>=0){ btns[i].click(); return \'clicked_by_label\'; } } return \'add_btn_not_found\'; })()');
    console.log(`  添加结果: ${kwAdded}`);
    await sleep(2000);

    await page.evaluate('(function(){ var inputs = document.querySelectorAll(\'input[role="combobox"], input[type="text"]\'); var input = null; for(var i=0;i<inputs.length;i++){ if(inputs[i].placeholder && inputs[i].placeholder.indexOf(\'keyword\')>=0){ input = inputs[i]; break; } } if(!input && inputs.length>0) input = inputs[inputs.length-1]; if(input){ input.focus(); input.value = "python"; input.dispatchEvent(new Event(\'input\', { bubbles: true })); } })()');
    await sleep(2000);

    await page.evaluate('(function(){ var options = document.querySelectorAll(\'li[role="option"]\'); if(options.length>0){ options[0].click(); return \'clicked_option_0: "\' + (options[0].textContent||\'\').trim() + \'"\'; } return \'no_options\'; })()');
    await sleep(3000);
    await logState(page, '添加 Keywords 后');

    console.log('\n=== 探测完成 ===');
    console.log('请观察各步骤的 URL 变化，判断哪些参数被 Recruiter 支持');
    return { success: true };
  }
});
