import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-confirm',
  access: 'read',
  description: '确认剩余5个问题：Skills/Companies autocomplete、结果加载时间、分页、多选',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 剩余问题确认探测 ===\n');

    // ===== 测试1: Companies placeholder + autocomplete =====
    console.log('--- 测试1: Companies placeholder + autocomplete ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var text = (all[i].textContent||"").trim().toLowerCase(); if(text.indexOf("company")>=0 && text.indexOf("add")<0){ all[i].click(); return "clicked: "+text; } } return "not_found"; })()');
    await sleep(1500);

    const compInputs = await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); return Array.from(inputs).map(function(inp){ return {ph: inp.placeholder||"", vis: inp.offsetParent!==null, w: inp.offsetWidth}; }).filter(function(inp){ return inp.vis && inp.w>50; }); })()');
    console.log(`Companies 输入框: ${JSON.stringify(compInputs)}`);

    if (compInputs.length > 0) {
      await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value="Google"; t.dispatchEvent(new Event("input",{bubbles:true})); } })()');
      console.log('  输入 Google，等 6 秒...');
      await sleep(6000);
      const compOpts = await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); return Array.from(opts).map(function(o){return (o.textContent||"").trim();}).filter(function(x){return x.length>0;}).slice(0,8); })()');
      console.log(`  Companies 下拉选项(${compOpts.length}个): ${JSON.stringify(compOpts)}`);
    }

    // ===== 测试2: Skills autocomplete（单独测试） =====
    console.log('\n--- 测试2: Skills autocomplete（单独页面） ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var text = (all[i].textContent||"").trim().toLowerCase(); if(text.indexOf("skill")>=0 && text.indexOf("add")<0){ all[i].click(); return "clicked: "+text; } } return "not_found"; })()');
    await sleep(1500);

    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value="Python"; t.dispatchEvent(new Event("input",{bubbles:true})); } })()');
    console.log('  输入 Python，等 6 秒...');
    await sleep(6000);
    const skillOpts = await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); return Array.from(opts).map(function(o){return (o.textContent||"").trim();}).filter(function(x){return x.length>0;}).slice(0,8); })()');
    console.log(`  Skills 下拉选项(${skillOpts.length}个): ${JSON.stringify(skillOpts)}`);

    // ===== 测试3: 搜索结果加载时间 =====
    console.log('\n--- 测试3: 搜索结果加载（等20秒） ---');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=software+engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('  URL已加载，等待 20 秒...');
    await sleep(20000);

    const resultState = await page.evaluate('(function(){ var body = document.body.innerText; var cards = document.querySelectorAll("#results-container .profile-list-item, #results-container li, .profile-list-item"); var ghost = document.querySelectorAll(".ghost-list-entity").length; return { cardCount: cards.length, ghostCount: ghost, hasLoading: body.indexOf("Loading")>=0 || body.indexOf("loading")>=0, hasStartSearch: body.indexOf("Start a search")>=0, hasNoResults: body.indexOf("No results")>=0, firstCardHtml: cards.length>0 ? cards[0].outerHTML.substring(0,200) : "none" }; })()');
    console.log(`  结果状态: ${JSON.stringify(resultState)}`);

    // 再等多段提取，看卡片结构
    if (resultState.cardCount > 0) {
      const cardDetail = await page.evaluate('(function(){ var cards = document.querySelectorAll("#results-container li, .profile-list-item"); if(cards.length===0) return {}; var c = cards[0]; return { name: (c.querySelector(".artdeco-entity-lockup__title")?.textContent||"").trim(), headline: (c.querySelector(".artdeco-entity-lockup__subtitle")?.textContent||"").trim(), location: (c.querySelector(".artdeco-entity-lockup__metadata")?.textContent||"").trim(), degree: (c.querySelector(".artdeco-entity-lockup__badge")?.textContent||"").trim(), hasLink: !!c.querySelector("a[href*=\"/in/\"]"), profileId: (c.querySelector("a[href*=\"/in/\"]")?.href||"").match(/\/in\/([^/?]+)/)?.[1] }; })()');
      console.log(`  第一张卡片详情: ${JSON.stringify(cardDetail)}`);
    }

    // ===== 测试4: 分页按钮 =====
    console.log('\n--- 测试4: 分页按钮（结果加载后） ---');
    const pagination = await page.evaluate('(function(){ var nextClass = document.querySelector(".artdeco-pagination__button--next"); var all = Array.from(document.querySelectorAll("button, [role=button]")); var nextBtn = null; var pageBtns = []; for(var i=0;i<all.length;i++){ var label = (all[i].getAttribute("aria-label")||"").toLowerCase(); var text = (all[i].textContent||"").trim(); if(label.indexOf("next")>=0 || text.toLowerCase().indexOf("next")>=0){ nextBtn = {text:text, label:label, disabled:all[i].disabled, className:all[i].className.substring(0,60)}; } if(!isNaN(parseInt(text)) && parseInt(text)>0 && parseInt(text)<100){ pageBtns.push(text); } } return {hasNextClass:!!nextClass, nextBtn:nextBtn, pageNumbers:pageBtns.slice(0,10)}; })()');
    console.log(`  分页: ${JSON.stringify(pagination)}`);

    // ===== 测试5: 各 facet 多选支持 =====
    console.log('\n--- 测试5: 各 facet 多选支持 ---');
    await page.goto('https://www.linkedin.com/talent/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(2000);

    const facetNames = ['Locations', 'Skills and Assessments', 'Companies', 'Keywords'];
    for (const fname of facetNames) {
      // 点击 Add
      const added = await page.evaluate(`(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var text = (all[i].textContent||"").trim().toLowerCase(); var label = (all[i].getAttribute("aria-label")||"").toLowerCase(); var sectionTitle = ""; var el = all[i]; for(var d=0;d<10;d++){ if(!el) break; var h2 = el.querySelector("h2"); if(!h2 && el.parentElement) h2 = el.parentElement.querySelector("h2"); if(h2){ sectionTitle = (h2.textContent||"").trim(); break; } el = el.parentElement; } if(sectionTitle.indexOf("${fname.replace(/'/g, "\\'")}")>=0 && (label.indexOf("add")>=0 || text.indexOf("add")<0)){ all[i].click(); return "clicked"; } } return "not_found"; })()`);
      console.log(`  ${fname}: 第一次点击 = ${added}`);
      await sleep(2000);

      if (added === 'clicked') {
        // 随便输入点东西触发 option 出现
        await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var t = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ t=inputs[i]; break; } } if(t){ t.focus(); t.value="test"; t.dispatchEvent(new Event("input",{bubbles:true})); } })()');
        await sleep(2000);
        await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); if(opts.length>0) opts[0].click(); })()');
        await sleep(3000);

        // 检查是否还能继续添加
        const canAdd = await page.evaluate(`(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var text = (all[i].textContent||"").trim().toLowerCase(); var label = (all[i].getAttribute("aria-label")||"").toLowerCase(); var sectionTitle = ""; var el = all[i]; for(var d=0;d<10;d++){ if(!el) break; var h2 = el.querySelector("h2"); if(!h2 && el.parentElement) h2 = el.parentElement.querySelector("h2"); if(h2){ sectionTitle = (h2.textContent||"").trim(); break; } el = el.parentElement; } if(sectionTitle.indexOf("${fname.replace(/'/g, "\\'")}")>=0 && (label.indexOf("add")>=0 || text.indexOf("add")<0)){ return {canAdd:true, text:text}; } } return {canAdd:false}; })()`);
        console.log(`    ${fname}: 添加后还能继续 = ${JSON.stringify(canAdd)}`);
      }
    }

    console.log('\n=== 确认探测完成 ===');
    return { success: true };
  }
});
