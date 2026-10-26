import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-trigger',
  access: 'read',
  description: '探测 LinkedIn Recruiter 搜索触发方式',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 搜索触发方式探测 ===\n');

    // ===== 方法1: 搜索框输入 + 完整键盘事件 =====
    console.log('--- 方法1: 搜索框完整键盘事件模拟 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    await page.evaluate('(function(){ var el = document.querySelector("#system-search-typeahead"); if(el){ el.focus(); el.value = "software engineer"; el.dispatchEvent(new Event("input", { bubbles: true })); } })()');
    await sleep(500);
    // 完整键盘事件序列
    await page.evaluate('(function(){ var el = document.querySelector("#system-search-typeahead"); if(el){ el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); } })()');
    await sleep(5000);

    const state1 = await page.evaluate('(function(){ var body = document.body.innerText; return { url: window.location.href, hasStartSearch: body.indexOf("Start a search") >= 0, hasLoading: body.indexOf("Loading") >= 0 || body.indexOf("loading") >= 0, cardCount: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
    console.log(`  结果: ${JSON.stringify(state1)}`);

    // ===== 方法2: 搜索框输入 + 点选下拉选项 =====
    console.log('\n--- 方法2: 搜索框输入后点选下拉选项 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    await page.evaluate('(function(){ var el = document.querySelector("#system-search-typeahead"); if(el){ el.focus(); el.value = "software engineer"; el.dispatchEvent(new Event("input", { bubbles: true })); } })()');
    await sleep(3000);

    const typeaheadOpts = await page.evaluate('(function(){ var opts = document.querySelectorAll("#typeahead-result-ember178 li[role=option], ul[role=listbox] li[role=option]"); return Array.from(opts).map(function(o){ return (o.textContent || "").trim(); }).filter(function(t){ return t.length > 0; }).slice(0, 5); })()');
    console.log(`  下拉选项: ${JSON.stringify(typeaheadOpts)}`);

    if (typeaheadOpts.length > 0) {
      await page.evaluate('(function(){ var opts = document.querySelectorAll("#typeahead-result-ember178 li[role=option], ul[role=listbox] li[role=option]"); if(opts.length > 0) opts[0].click(); })()');
      await sleep(5000);
    } else {
      // 没有下拉选项，按 Enter
      await page.evaluate('(function(){ var el = document.querySelector("#system-search-typeahead"); if(el){ el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true })); } })()');
      await sleep(5000);
    }

    const state2 = await page.evaluate('(function(){ var body = document.body.innerText; return { url: window.location.href, hasStartSearch: body.indexOf("Start a search") >= 0, hasLoading: body.indexOf("Loading") >= 0, cardCount: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
    console.log(`  结果: ${JSON.stringify(state2)}`);

    // ===== 方法3: 只加 facet 筛选，不输入主搜索词 =====
    console.log('\n--- 方法3: 只加 Job titles facet，不输入主搜索词 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label = (all[i].getAttribute("aria-label") || "").toLowerCase(); if(label.indexOf("job titles") >= 0 && label.indexOf("add") >= 0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
    await sleep(1500);
    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent !== null && inputs[i].offsetWidth > 50){ t = inputs[i]; break; } } if(t){ t.focus(); t.value = "Architect"; t.dispatchEvent(new Event("input", { bubbles: true })); } })()');
    await sleep(3000);
    await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length > 0) opts[0].click(); })()');
    await sleep(8000);

    const state3 = await page.evaluate('(function(){ var body = document.body.innerText; return { url: window.location.href, hasStartSearch: body.indexOf("Start a search") >= 0, hasLoading: body.indexOf("Loading") >= 0, cardCount: document.querySelectorAll("#results-container li, .profile-list-item").length, filterPills: document.querySelectorAll(".search-query-summary__filter-pill").length }; })()');
    console.log(`  结果: ${JSON.stringify(state3)}`);

    // ===== 方法4: 主搜索词 + facet 组合 =====
    console.log('\n--- 方法4: 主搜索词 + Job titles facet ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    // 先输主搜索词
    await page.evaluate('(function(){ var el = document.querySelector("#system-search-typeahead"); if(el){ el.focus(); el.value = "engineer"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); } })()');
    await sleep(3000);

    // 打开面板加 facet
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label = (all[i].getAttribute("aria-label") || "").toLowerCase(); if(label.indexOf("job titles") >= 0 && label.indexOf("add") >= 0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
    await sleep(1500);
    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent !== null && inputs[i].offsetWidth > 50){ t = inputs[i]; break; } } if(t){ t.focus(); t.value = "Senior"; t.dispatchEvent(new Event("input", { bubbles: true })); } })()');
    await sleep(3000);
    await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length > 0) opts[0].click(); })()');
    await sleep(8000);

    const state4 = await page.evaluate('(function(){ var body = document.body.innerText; return { url: window.location.href, hasStartSearch: body.indexOf("Start a search") >= 0, hasLoading: body.indexOf("Loading") >= 0, cardCount: document.querySelectorAll("#results-container li, .profile-list-item").length, filterPills: document.querySelectorAll(".search-query-summary__filter-pill").length }; })()');
    console.log(`  结果: ${JSON.stringify(state4)}`);

    // ===== 方法5: 检查是否有"搜索"按钮 =====
    console.log('\n--- 方法5: 扫描所有可能的搜索触发按钮 ---');
    const searchTriggers = await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button, [role=button], a")); var results = []; for(var i=0;i<all.length;i++){ var text = (all[i].textContent || "").trim().toLowerCase(); var label = (all[i].getAttribute("aria-label") || "").toLowerCase(); if(text.indexOf("search") >= 0 || label.indexOf("search") >= 0 || text.indexOf("go") >= 0 || label.indexOf("go") >= 0 || text.indexOf("find") >= 0 || label.indexOf("find") >= 0){ results.push({tag: all[i].tagName, text: text.substring(0,30), label: label.substring(0,40)}); } } return results; })()');
    console.log(`  搜索相关按钮(${searchTriggers.length}个): ${JSON.stringify(searchTriggers)}`);

    // ===== 方法6: 检查搜索框旁边的按钮 =====
    console.log('\n--- 方法6: 搜索框周围的按钮 ---');
    const nearSearch = await page.evaluate('(function(){ var searchEl = document.querySelector("#system-search-typeahead"); if(!searchEl) return []; var parent = searchEl.parentElement; var grandparent = parent ? parent.parentElement : null; var container = grandparent || parent || document.body; var btns = container.querySelectorAll("button, [role=button]"); var results = []; for(var i=0;i<btns.length;i++){ results.push({text: (btns[i].textContent || "").trim().substring(0,20), label: (btns[i].getAttribute("aria-label") || "").substring(0,30)}); } return results; })()');
    console.log(`  搜索框周围按钮: ${JSON.stringify(nearSearch)}`);

    console.log('\n=== 触发探测完成 ===');
    return { success: true };
  }
});
