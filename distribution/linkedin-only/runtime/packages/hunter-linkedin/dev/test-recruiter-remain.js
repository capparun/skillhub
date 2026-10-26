import { cli, Strategy } from '@jackwener/opencli/registry';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-recruiter-remain',
  access: 'read',
  description: '探测 Skills/Companies facet、Locations选项、搜索结果加载',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('=== 剩余问题探测 ===\n');

    // ===== Step 1: 打开页面并提交搜索（通过URL参数） =====
    console.log('--- Step 1: 通过URL参数直接搜索 ---');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=software+engineer&start=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    const url1 = await page.evaluate('window.location.href');
    console.log(`URL: ${url1}`);

    const hasResults = await page.evaluate('(function(){ var cards = document.querySelectorAll("#results-container .profile-list-item, ol.profile-list li"); return cards.length; })()');
    console.log(`结果卡片数: ${hasResults}`);

    const pageText = await page.evaluate('(function(){ return document.body.innerText.substring(0, 500); })()');
    console.log(`页面文字前500字: ${pageText.replace(/\n/g, " ")}`);

    // ===== Step 2: 打开筛选面板并扫描所有 section =====
    console.log('\n--- Step 2: 扫描面板内所有 section（含滚动） ---');
    await page.evaluate('(function(){ var btn = document.querySelector(".search-query-summary__edit-filters-btn"); if(btn) btn.click(); })()');
    await sleep(3000);

    // 先扫描一次
    let allSections = await page.evaluate('(function(){ var sections = document.querySelectorAll("section, [role=region]"); var results = []; for(var i=0;i<sections.length;i++){ var h2 = sections[i].querySelector("h2"); var title = h2 ? (h2.textContent||"").trim() : ""; if(title) results.push({index:i, title:title, html: sections[i].innerHTML.substring(0,200)}); } return results; })()');
    console.log(`初始扫描到 ${allSections.length} 个 section:`);
    allSections.forEach(s => console.log(`  [${s.index}] "${s.title}"`));

    // 滚动面板
    console.log('\n--- Step 3: 滚动面板找隐藏 section ---');
    for(let round=0; round<5; round++){
      await page.evaluate('(function(){ var panel = document.querySelector("aside"); if(panel) panel.scrollBy(0, 300); else { var sections = document.querySelectorAll("section"); for(var i=0;i<sections.length;i++){ sections[i].scrollBy(0, 300); } } })()');
      await sleep(1000);
    }
    await sleep(2000);

    // 再次扫描
    allSections = await page.evaluate('(function(){ var sections = document.querySelectorAll("section, [role=region]"); var results = []; for(var i=0;i<sections.length;i++){ var h2 = sections[i].querySelector("h2"); var title = h2 ? (h2.textContent||"").trim() : ""; if(title) results.push({index:i, title:title}); } return results; })()');
    console.log(`滚动后扫描到 ${allSections.length} 个 section:`);
    allSections.forEach(s => console.log(`  [${s.index}] "${s.title}"`));

    // 扫描所有按钮（更宽泛）
    console.log('\n--- Step 4: 扫描所有按钮（含aria-label） ---');
    const allButtons = await page.evaluate('(function(){ var btns = document.querySelectorAll("button"); var results = []; for(var i=0;i<btns.length;i++){ var text = (btns[i].textContent||"").trim(); var label = btns[i].getAttribute("aria-label")||""; if(text.length>0 || label.length>0){ results.push({index:i, text:text.substring(0,40), label:label.substring(0,60)}); } } return results; })()');
    console.log(`找到 ${allButtons.length} 个按钮，显示前20个:`);
    allButtons.slice(0, 20).forEach(b => console.log(`  [${b.index}] text="${b.text}" label="${b.label}"`));

    // 找 Skills / Companies 相关按钮
    const relevant = allButtons.filter(b =>
      b.text.toLowerCase().includes('skill') || b.label.toLowerCase().includes('skill') ||
      b.text.toLowerCase().includes('company') || b.label.toLowerCase().includes('company') ||
      b.text.toLowerCase().includes('assessment') || b.label.toLowerCase().includes('assessment')
    );
    console.log(`\nSkills/Companies 相关按钮(${relevant.length}个):`);
    relevant.forEach(b => console.log(`  [${b.index}] text="${b.text}" label="${b.label}"`));

    // ===== Step 5: 测试 Locations 长等待 =====
    console.log('\n--- Step 5: Locations 输入 + 长等待 ---');
    // 先找到 Locations 的 Add 按钮并点击
    await page.evaluate('(function(){ var all = Array.from(document.querySelectorAll("button")); for(var i=0;i<all.length;i++){ var label=(all[i].getAttribute("aria-label")||"").toLowerCase(); var text=(all[i].textContent||"").trim().toLowerCase(); if((label.indexOf("location")>=0 || text.indexOf("location")>=0) && (label.indexOf("add")>=0 || text.indexOf("add")>=0)){ all[i].click(); return "clicked: "+text; } } return "not_found"; })()');
    await sleep(1500);

    // 输入 Beijing 试试
    await page.evaluate('(function(){ var inputs = document.querySelectorAll("input[role=combobox], input[type=text]"); var target = null; for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50 && (inputs[i].placeholder||"").indexOf("location")>=0){ target=inputs[i]; break; } } if(!target && inputs.length>0){ for(var i=inputs.length-1;i>=0;i--){ if(inputs[i].offsetParent!==null && inputs[i].offsetWidth>50){ target=inputs[i]; break; } } } if(target){ target.focus(); target.value="Beijing"; target.dispatchEvent(new Event("input",{bubbles:true})); return "inputted to: "+target.placeholder; } return "no_input_found"; })()');
    console.log('  输入 Beijing，等待 5 秒...');
    await sleep(5000);

    const locOptions = await page.evaluate('(function(){ var opts = document.querySelectorAll("li[role=option]"); return Array.from(opts).map(function(o){return (o.textContent||"").trim();}).filter(function(t){return t.length>0;}).slice(0,10); })()');
    console.log(`  下拉选项(${locOptions.length}个): ${JSON.stringify(locOptions)}`);

    // ===== Step 6: 检查搜索结果区域结构 =====
    console.log('\n--- Step 6: 搜索结果区域DOM结构 ---');
    const resultDom = await page.evaluate('(function(){ var container = document.querySelector("#results-container"); if(!container) return {found:false}; var sections = container.querySelectorAll("section, ol, ul"); var sectionInfo = []; for(var i=0;i<sections.length;i++){ var h2 = sections[i].querySelector("h2"); sectionInfo.push({tag:sections[i].tagName, hasH2:!!h2, h2Text:h2?(h2.textContent||"").trim():"", childCount:sections[i].children.length}); } return {found:true, sectionCount:sections.length, sections:sectionInfo.slice(0,5)}; })()');
    console.log(`结果容器: ${JSON.stringify(resultDom)}`);

    // 如果没有结果，检查是否有 loading 状态
    const loadingState = await page.evaluate('(function(){ var body = document.body.innerText; return { hasLoading: body.indexOf("loading")>=0 || body.indexOf("Loading")>=0, hasStartSearch: body.indexOf("Start a search")>=0, hasNoResults: body.indexOf("No results")>=0 || body.indexOf("no results")>=0 }; })()');
    console.log(`页面状态: ${JSON.stringify(loadingState)}`);

    console.log('\n=== 探测完成 ===');
    return { success: true };
  }
});
