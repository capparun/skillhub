import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-search',
  access: 'read',
  description: '验证 facet 组合是否能触发搜索结果显示',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== facet 组合搜索验证 ===\n');

    // 策略：打开页面 -> 加 Job titles -> 加 Keywords -> 观察结果
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    console.log('--- 初始状态 ---');
    let state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, hasLoading: b.indexOf("Loading") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
    console.log(`  ${JSON.stringify(state)}`);

    // 打开面板
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    // 加 Job titles = "Engineer"
    console.log('\n--- 加 Job titles = "Engineer" ---');
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("job titles")>=0 && label.indexOf("add")>=0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
    await sleep(1500);
    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t=null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value="Engineer"; t.dispatchEvent(new Event("input",{bubbles:true})); } })()');
    await sleep(3000);
    await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length>0) opts[0].click(); })()');
    await sleep(5000);

    state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, hasLoading: b.indexOf("Loading") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length, pills: document.querySelectorAll(".search-query-summary__filter-pill").length }; })()');
    console.log(`  ${JSON.stringify(state)}`);

    // 加 Keywords = "software"
    console.log('\n--- 加 Keywords = "software" ---');
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("profile keywords")>=0 && label.indexOf("add")>=0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
    await sleep(1500);
    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t=null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value="software"; t.dispatchEvent(new Event("input",{bubbles:true})); } })()');
    await sleep(3000);
    await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length>0) opts[0].click(); })()');
    await sleep(8000);

    state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, hasLoading: b.indexOf("Loading") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length, pills: document.querySelectorAll(".search-query-summary__filter-pill").length }; })()');
    console.log(`  ${JSON.stringify(state)}`);

    // 如果还有 Start a search，尝试只加 Locations
    if (state.hasStartSearch) {
      console.log('\n--- 尝试只加 Locations = "Beijing" ---');
      await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(5000);
      await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
      await sleep(2000);

      await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("location")>=0 && label.indexOf("add")>=0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
      await sleep(1500);
      await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t=null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value="Beijing"; t.dispatchEvent(new Event("input",{bubbles:true})); } })()');
      await sleep(5000);
      await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length>0) opts[0].click(); })()');
      await sleep(8000);

      state = await page.evaluate('(function(){ var b = document.body.innerText; return { url: window.location.href, hasStartSearch: b.indexOf("Start a search") >= 0, hasLoading: b.indexOf("Loading") >= 0, cards: document.querySelectorAll("#results-container li, .profile-list-item").length }; })()');
      console.log(`  ${JSON.stringify(state)}`);
    }

    // 最后尝试：如果页面显示结果了，扫描结果卡片结构
    if (!state.hasStartSearch && state.cards > 0) {
      console.log('\n--- 结果卡片结构 ---');
      const card = await page.evaluate('(function(){ var cards = document.querySelectorAll("#results-container li, .profile-list-item"); if(cards.length===0) return {}; var c = cards[0]; return { name: (c.querySelector(".artdeco-entity-lockup__title")?.textContent||"").trim(), headline: (c.querySelector(".artdeco-entity-lockup__subtitle")?.textContent||"").trim(), location: (c.querySelector(".artdeco-entity-lockup__metadata")?.textContent||"").trim(), degree: (c.querySelector(".artdeco-entity-lockup__badge")?.textContent||"").trim(), hasLink: !!c.querySelector("a[href*=\"/in/\"]"), html: c.outerHTML.substring(0,300) }; })()');
      console.log(`  ${JSON.stringify(card)}`);
    }

    console.log('\n=== 验证完成 ===');
    return { success: true };
  }
});
