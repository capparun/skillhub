import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-final',
  access: 'read',
  description: '最终确认：Skills/Companies交互、结果加载、分页',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 最终确认探测 ===\n');

    // ===== Part 1: 测试 Skills 和 Companies 交互 =====
    console.log('--- Part 1: Skills 交互 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    // 点击 Skills Add 按钮（用按钮文字匹配，不用aria-label）
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var text = (all[i].textContent||"").trim().toLowerCase(); if(text.indexOf("skill")>=0 && text.indexOf("add")<0){ all[i].click(); return "clicked: "+text; } } return "not_found"; })()');
    await sleep(1500);

    const skillsInputs = await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); return Array.from(inputs).map(function(inp){ return {placeholder: inp.placeholder||"", visible: inp.offsetParent!==null, width: inp.offsetWidth}; }).filter(function(inp){ return inp.visible && inp.width>50; }); })()');
    console.log(`Skills 输入框: ${JSON.stringify(skillsInputs)}`);

    if (skillsInputs.length > 0) {
      await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var target = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ target=inputs[i]; break; } } if(target){ target.focus(); target.value="Python"; target.dispatchEvent(new Event("input",{bubbles:true})); } })()');
      await sleep(3000);
      const skillOpts = await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); return Array.from(opts).map(function(o){return (o.textContent||"").trim();}).filter(function(t){return t.length>0;}).slice(0,5); })()');
      console.log(`Skills 下拉选项: ${JSON.stringify(skillOpts)}`);
    }

    console.log('\n--- Part 2: Companies 交互 ---');
    // 点击 Companies Add 按钮
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var text = (all[i].textContent||"").trim().toLowerCase(); if(text.indexOf("company")>=0 && text.indexOf("add")<0){ all[i].click(); return "clicked: "+text; } } return "not_found"; })()');
    await sleep(1500);

    const compInputs = await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); return Array.from(inputs).map(function(inp){ return {placeholder: inp.placeholder||"", visible: inp.offsetParent!==null, width: inp.offsetWidth}; }).filter(function(inp){ return inp.visible && inp.width>50; }); })()');
    console.log(`Companies 输入框: ${JSON.stringify(compInputs)}`);

    if (compInputs.length > 0) {
      await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var target = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ target=inputs[i]; break; } } if(target){ target.focus(); target.value="Google"; target.dispatchEvent(new Event("input",{bubbles:true})); } })()');
      await sleep(3000);
      const compOpts = await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); return Array.from(opts).map(function(o){return (o.textContent||"").trim();}).filter(function(t){return t.length>0;}).slice(0,5); })()');
      console.log(`Companies 下拉选项: ${JSON.stringify(compOpts)}`);
    }

    // ===== Part 3: 搜索结果加载（长等待） =====
    console.log('\n--- Part 3: URL参数搜索 + 长等待 ---');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=software+engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('等待 10 秒让结果加载...');
    await sleep(10000);

    const url = await page.evaluate('window.location.href');
    console.log(`URL: ${url}`);

    // 多种选择器尝试提取结果
    const resultsBySelector = await page.evaluate('(function(){ var r = {}; r.container_li = document.querySelectorAll("#results-container li").length; r.container_div = document.querySelectorAll("#results-container > div").length; r.container_section = document.querySelectorAll("#results-container section").length; r.ol_li = document.querySelectorAll("ol.profile-list li").length; r.profile_items = document.querySelectorAll(".profile-list-item").length; r.artdeco_lockup = document.querySelectorAll(".artdeco-entity-lockup__title").length; r.search_result = document.querySelectorAll("[data-control-name=search_result]").length; var bodyText = document.body.innerText; r.hasStartSearch = bodyText.indexOf("Start a search")>=0; r.hasNoResults = bodyText.indexOf("No results")>=0; r.hasLoading = bodyText.indexOf("Loading")>=0 || bodyText.indexOf("loading")>=0; return r; })()');
    console.log(`结果统计: ${JSON.stringify(resultsBySelector)}`);

    // 尝试提取第一张卡片
    const firstCard = await page.evaluate('(function(){ var cards = document.querySelectorAll("#results-container li, .profile-list-item, [data-control-name=search_result]"); if(cards.length===0) return {found:0}; var c = cards[0]; return {found:cards.length, html:c.outerHTML.substring(0,300)}; })()');
    console.log(`第一张卡片: ${JSON.stringify(firstCard)}`);

    // ===== Part 4: 分页按钮 =====
    console.log('\n--- Part 4: 分页按钮 ---');
    const pagination = await page.evaluate('(function(){ var nextBtn = document.querySelector(".artdeco-pagination__button--next"); var allBtns = Array.from(document.querySelectorAll("button")); var nextByLabel = null; for(var i=0;i<allBtns.length;i++){ var label=(allBtns[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("next")>=0){ nextByLabel={text:(allBtns[i].textContent||"").trim(),label:label,disabled:allBtns[i].disabled}; break; } } return {hasNextClass:!!nextBtn, nextByLabel:nextByLabel}; })()');
    console.log(`分页: ${JSON.stringify(pagination)}`);

    // ===== Part 5: Job titles 多选测试 =====
    console.log('\n--- Part 5: Job titles 多选测试 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    // 添加第一个 Job title
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("job titles")>=0 && label.indexOf("add")>=0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
    await sleep(1500);
    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var target = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ target=inputs[i]; break; } } if(target){ target.focus(); target.value="Architect"; target.dispatchEvent(new Event("input",{bubbles:true})); } })()');
    await sleep(2500);
    await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length>0) opts[0].click(); })()');
    await sleep(3000);

    // 检查是否还能添加第二个
    const canAddSecond = await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("job titles")>=0 && label.indexOf("add")>=0){ return {canAdd:true, label:label}; } } return {canAdd:false}; })()');
    console.log(`添加第一个后还能继续添加: ${JSON.stringify(canAddSecond)}`);

    // 如果能添加，测试添加第二个
    if (canAddSecond.canAdd) {
      await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); if(label.indexOf("job titles")>=0 && label.indexOf("add")>=0){ all[i].click(); return "clicked"; } } return "not_found"; })()');
      await sleep(1500);
      const secondInputs = await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); return Array.from(inputs).map(function(inp){ return {placeholder: inp.placeholder||"", visible: inp.offsetParent!==null}; }).filter(function(inp){ return inp.visible; }); })()');
      console.log(`添加第二个时的输入框: ${JSON.stringify(secondInputs)}`);
    }

    console.log('\n=== 最终探测完成 ===');
    return { success: true };
  }
});
