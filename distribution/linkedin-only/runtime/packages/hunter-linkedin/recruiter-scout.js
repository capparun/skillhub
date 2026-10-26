import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getLinkedInTier,
  getTierConfig,
  buildRecruiterSearchBoolean,
  getProfileUrl,
  getPeopleSearchUrl,
  validateTier,
  supportsRecruiterSearch,
} from './lib/index.js';
import { bringPageToFront } from './lib/platform.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CONFIG_DIR = path.join(os.homedir(), '.hunter', 'channels', 'linkedin-recruiter');
const TAGS_FILE = path.join(CONFIG_DIR, 'tags.csv');
const RESULT_FILE = path.join(CONFIG_DIR, 'linkedin-recruiter-scout-result.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function writeTagsToCSV(profileId, name, tag, searchParams) {
  ensureConfigDir();
  const header = 'profileId,name,tags,searchKeyword,searchLocation,searchTime,processed,platform\n';
  let isNewFile = !fs.existsSync(TAGS_FILE);
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const newLine = `${profileId},${name || '?'},${tag},${searchParams.keyword || ''},${searchParams.location || ''},${timestamp},false,linkedin-recruiter\n`;
  if (isNewFile) {
    fs.writeFileSync(TAGS_FILE, header + newLine);
  } else {
    fs.appendFileSync(TAGS_FILE, newLine);
  }
}

/**
 * 从 Recruiter 搜索结果页面提取候选人卡片
 * 尝试多种选择器适配不同渲染状态
 */
async function extractRecruiterCards(page) {
  return await page.evaluate(`(function(){
    var results = [];
    var seen = new Set();

    // 辅助：清理文本
    function cleanText(text){
      if(!text) return '';
      var result = '';
      for(var i = 0; i < text.length; i++){
        var ch = text.charAt(i);
        var code = ch.charCodeAt(0);
        if(code === 32 || code === 10 || code === 13 || code === 9){
          if(result.length > 0 && result.charAt(result.length - 1) !== ' '){
            result += ' ';
          }
        } else {
          result += ch;
        }
      }
      return result.trim();
    }

    // 策略: 在 #results-container 内查找卡片
    // 优先 .artdeco-entity-lockup（当前 Recruiter 实际使用的结构）
    var container = document.querySelector('#results-container');
    var cards = [];

    if(container){
      var lockups = container.querySelectorAll('.artdeco-entity-lockup');
      if(lockups.length > 0){
        cards = Array.from(lockups);
      } else {
        // 回退：找 .profile-list-item（旧结构）
        var items = container.querySelectorAll('.profile-list-item');
        if(items.length > 0){
          cards = Array.from(items);
        } else {
          // 再回退：找 li.profile-list__border-bottom
          var lis = container.querySelectorAll('li.profile-list__border-bottom');
          if(lis.length > 0) cards = Array.from(lis);
        }
      }
    }

    // 提取结果总数
    var totalText = '';
    var totalEl = document.querySelector('.profile-list__header-info-text');
    if(totalEl) totalText = cleanText(totalEl.textContent);

    // 返回原始 lockup 数量（用于判断加载状态）
    var lockupCount = container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0;

    for(var i=0;i<cards.length;i++){
      var card = cards[i];

      // 提取名字
      var name = '';
      var nameEl = card.querySelector('.artdeco-entity-lockup__title a');
      if(nameEl) name = cleanText(nameEl.textContent);

      // 提取链接和 profileId
      var profileUrl = '';
      var profileId = '';
      if(nameEl){
        profileUrl = (nameEl.href || '').split('?')[0];
        if(profileUrl.indexOf('/talent/') >= 0){
          var re = new RegExp('/talent/(?:profile|hiring)/([^/?]+)');
          var m = profileUrl.match(re);
          if(m) profileId = m[1];
        } else if(profileUrl.indexOf('/in/') >= 0){
          var parts = profileUrl.split('/in/');
          if(parts[1]){
            profileId = parts[1];
            if(profileId.charAt(profileId.length - 1) === '/'){
              profileId = profileId.slice(0, -1);
            }
          }
        }
      }

      if(!profileId || seen.has(profileId)) continue;
      seen.add(profileId);

      // 提取 headline
      var headline = '';
      var headlineEl = card.querySelector('.artdeco-entity-lockup__subtitle');
      if(headlineEl) headline = cleanText(headlineEl.textContent);

      // 提取 location
      var location = '';
      var locEl = card.querySelector('.artdeco-entity-lockup__metadata');
      if(locEl) location = cleanText(locEl.textContent);

      // 提取 connection degree
      var degree = '';
      var badgeEl = card.querySelector('.artdeco-entity-lockup__badge');
      if(badgeEl){
        var rawDegree = cleanText(badgeEl.textContent);
        if(rawDegree.indexOf('1st') >= 0) degree = '1st';
        else if(rawDegree.indexOf('2nd') >= 0) degree = '2nd';
        else if(rawDegree.indexOf('3rd') >= 0) degree = '3rd';
        else degree = rawDegree;
      }

      // 提取当前公司
      // LinkedIn Recruiter headline 格式多样：
      //   "Meta | Apple | CMU"（公司列表）
      //   "Director at Google"（职位@公司）
      //   "Software Engineer @ Apple"（职位@公司）
      var currentCompany = '';
      if(headline){
        var parts = headline.split('|').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
        if(parts.length > 1){
          currentCompany = parts[0];
        } else {
          var m1 = headline.match(/(?:at|@)\s+([^,;|·]+)/i);
          if(m1){
            currentCompany = m1[1].trim();
          } else if(headline.length > 0 && headline.length < 60){
            currentCompany = headline;
          }
        }
      }

      results.push({
        name: name,
        headline: headline,
        location: location,
        connectionDegree: degree,
        profileUrl: profileUrl,
        profileId: profileId,
        currentCompany: currentCompany,
        sourcePlatform: 'linkedin-recruiter'
      });
    }

    return {
      count: results.length,
      cards: results,
      totalText: totalText,
      lockupCount: lockupCount,
      hasStartSearch: document.body.innerText.indexOf('Start a search') >= 0,
      hasLoading: document.body.innerText.indexOf('Loading') >= 0,
      url: window.location.href
    };
  })()`);
}

/**
 * 点击下一页按钮
 */
async function clickNextPage(page) {
  const result = await page.evaluate(`(function(){
    // 策略1: 找 aria-label="Go to next page" 的链接
    var nextLink = document.querySelector('a[rel="next"]');
    if(nextLink){
      nextLink.click();
      return {clicked: true, method: 'rel-next'};
    }
    // 策略2: 找包含 "next page" 文本的链接
    var allLinks = Array.from(document.querySelectorAll('a'));
    for(var i=0;i<allLinks.length;i++){
      var text = (allLinks[i].textContent || '').toLowerCase();
      var aria = (allLinks[i].getAttribute('aria-label') || '').toLowerCase();
      if((text.indexOf('next')>=0 && text.indexOf('page')>=0) || aria.indexOf('next page')>=0){
        allLinks[i].click();
        return {clicked: true, method: 'text-match'};
      }
    }
    // 策略3: 找 Next button
    var allBtns = Array.from(document.querySelectorAll('button'));
    for(var i=0;i<allBtns.length;i++){
      var aria = (allBtns[i].getAttribute('aria-label') || '').toLowerCase();
      if(aria.indexOf('next')>=0 && !allBtns[i].disabled){
        allBtns[i].click();
        return {clicked: true, method: 'button'};
      }
    }
    return {clicked: false};
  })()`);
  return result.clicked;
}

cli({
  site: 'hunter-linkedin',
  name: 'recruiter-scout',
  access: 'write',
  description: 'LinkedIn Recruiter 人才寻访：通过企业版搜索候选人',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', default: '', description: '搜索关键词（布尔查询）' },
    { name: 'searchUrl', type: 'string', default: '', description: 'LinkedIn Recruiter 历史搜索 URL（含 searchContextId，可替代 keyword+筛选条件）' },
    { name: 'jobTitles', type: 'string', default: '', description: '职位标题筛选（逗号分隔）' },
    { name: 'location', type: 'string', default: '', description: '地点筛选（逗号分隔）' },
    { name: 'companies', type: 'string', default: '', description: '公司筛选（逗号分隔）' },
    { name: 'skills', type: 'string', default: '', description: '技能筛选（逗号分隔）' },
    { name: 'keywords', type: 'string', default: '', description: '附加关键词筛选（逗号分隔，单选）' },
    { name: 'limit', type: 'int', default: 25, description: '最大结果数量' },
    { name: 'tagPrefix', type: 'string', default: '', description: '标签前缀' },
    { name: 'raw', type: 'boolean', default: false, description: '原始模式：仅输出JSON，不写入tags.csv' },
    { name: 'output', type: 'string', default: '', description: '输出文件路径' },
    { name: 'skipTierCheck', type: 'boolean', default: false, description: '跳过 LinkedIn 账号档位校验' },
  ],
  func: async (page, kwargs) => {
    const { keyword, searchUrl: inputSearchUrl, jobTitles, location, companies, skills, keywords, limit, tagPrefix, raw, output } = kwargs;
    const linkedinTier = getLinkedInTier();
    const tierCfg = getTierConfig(linkedinTier);

    // Recruiter is a separate paid product. Reject unsupported configured tiers
    // before any browser navigation; --skipTierCheck must not bypass entitlement.
    if (!supportsRecruiterSearch(linkedinTier)) {
      console.error(`当前配置档位 ${tierCfg.label} 不支持 LinkedIn Recruiter 搜索`);
      return {
        success: false,
        error: 'tier_mismatch',
        details: {
          expected: 'recruiter_lite | recruiter_corporate | rps',
          configured: linkedinTier,
          navigated: false,
        },
      };
    }

    // 参数校验
    if(!keyword && !inputSearchUrl){
      console.error('错误: 必须提供 keyword 或 searchUrl 之一');
      return { success: false, error: 'missing_keyword_or_searchUrl' };
    }

    console.error('='.repeat(60));
    console.error('LinkedIn Recruiter 人才寻访');
    console.error('='.repeat(60));
    console.error(`账号档位: ${tierCfg.label} | 关键词: ${keyword || '(来自 searchUrl)'} | 数量上限: ${limit}`);
    if(jobTitles) console.error(`职位: ${jobTitles}`);
    if(location) console.error(`地点: ${location}`);
    if(companies) console.error(`公司: ${companies}`);
    if(skills) console.error(`技能: ${skills}`);
    if(keywords) console.error(`附加关键词: ${keywords}`);

    const today = new Date();
    const monthDay = `${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
    const prefix = tagPrefix || (keyword ? keyword.slice(0, 3).toUpperCase() : 'URL');
    const tag = `R${prefix}${monthDay}`;
    console.error(`标签: ${tag}\n`);

    if (!kwargs.skipTierCheck) {
      const v = await validateTier(page, linkedinTier);
      if (v.severity === 'error') {
        console.error(`\n❌ ${v.mismatchReason}`);
        return { success: false, error: 'tier_mismatch', details: v };
      }
      if (v.severity === 'warning') {
        console.error(`\n⚠️  ${v.mismatchReason}\n`);
      }
    }

    // ========== Phase A+B: 导航到搜索 URL 并等待结果 ==========
    console.error('--- Phase A: 导航到 Recruiter 搜索页 ---');

    // 先从 /talent/home 开始，确保 Recruiter 权限和认证状态
    console.error('  先访问 /talent/home...');
    await page.goto('https://www.linkedin.com/talent/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    var homeUrl = await page.evaluate('window.location.href');
    if(homeUrl.includes('login') || homeUrl.includes('authwall')){
      console.error('未登录 LinkedIn');
      return { success: false, error: 'not_logged_in' };
    }
    if(homeUrl.includes('enterprise-authentication')){
      console.error('LinkedIn Recruiter 企业认证已过期');
      console.error('请在浏览器中手动访问 https://www.linkedin.com/talent/search 完成认证');
      return { success: false, error: 'needs_enterprise_auth' };
    }
    if(!homeUrl.includes('/talent/')){
      console.error('当前账号无 Recruiter 权限');
      return { success: false, error: 'not_recruiter' };
    }
    console.error('  Home 页已加载');

    // 再导航到搜索页
    let searchUrl;
    if(inputSearchUrl){
      searchUrl = inputSearchUrl;
      console.error(`  使用历史搜索 URL: ${searchUrl.substring(0, 80)}...`);
    } else {
      const searchBoolean = buildRecruiterSearchBoolean({ keyword, jobTitles, location, companies, skills, keywords });
      console.error(`  搜索表达式: ${searchBoolean}`);
      searchUrl = getPeopleSearchUrl(linkedinTier, { keyword: searchBoolean, start: 0 });
    }
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    const currentUrl = await page.evaluate('window.location.href');
    console.error('  搜索页已加载');

    // 激活浏览器页面：LinkedIn Recruiter 需要前台页面才能正常渲染。
    // 使用浏览器适配器能力，避免依赖 macOS-only osascript。
    console.error('\n--- 激活浏览器窗口 ---');
    const activated = await bringPageToFront(page);
    console.error(activated
      ? '  浏览器页面已请求切换到前台'
      : '  当前浏览器适配器不支持自动切换；请保持该标签页可见');
    await sleep(2000);

    // 检测标签页是否在前台——Chrome 后台 tab 会严重节流 JS，导致 Ember.js 无法渲染
    console.error('\n--- 检查标签页状态 ---');
    let tabState = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);
    console.error(`  当前状态: hidden=${tabState.hidden}, visibilityState=${tabState.visibilityState}`);

    if(tabState.hidden){
      console.error('');
      console.error('╔══════════════════════════════════════════════════════════════╗');
      console.error('║  ⚠️  LinkedIn 标签页处于后台，Chrome 会冻结 JavaScript 执行   ║');
      console.error('║                                                              ║');
      console.error('║  请立即手动操作：                                            ║');
      console.error('║  1. 切换到浏览器窗口                                         ║');
      console.error('║  2. 点击 LinkedIn Recruiter 搜索页的标签页，让它成为当前页   ║');
      console.error('║  3. 保持浏览器窗口可见（不要最小化）                         ║');
      console.error('╚══════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error('  等待中...（最多等 60 秒）');

      let waitSeconds = 0;
      while(waitSeconds < 60){
        await sleep(2000);
        waitSeconds += 2;
        tabState = await page.evaluate(`(function(){
          return { hidden: document.hidden, visibilityState: document.visibilityState };
        })()`);
        if(!tabState.hidden){
          console.error(`  ✅ 标签页已切换到前台，继续执行`);
          break;
        }
        if(waitSeconds % 10 === 0){
          console.error(`  已等待 ${waitSeconds}s，请切换标签页...`);
        }
      }

      if(tabState.hidden){
        console.error('  警告：60 秒内未切换到前台，继续执行但结果可能不完整');
      }
    } else {
      console.error('  ✅ 标签页已在前台');
    }

    // 循环等待结果加载
    console.error('\n--- Phase B: 等待结果加载 ---');
    let extraction = await extractRecruiterCards(page);
    console.error(`  [0s] lockups=${extraction.lockupCount}, cards=${extraction.count}`);

    // 自适应等待策略：前台 tab 内容加载快，后台 tab 需要长等待
    const isForeground = !tabState.hidden;
    if(isForeground && extraction.count > 0){
      // 前台且已有真实卡片：短等待让剩余内容填充
      console.error(`  前台 tab，已有 ${extraction.count} 张卡片，短等待填充...`);
      await sleep(5000);
      extraction = await extractRecruiterCards(page);
      console.error(`  5秒后: lockups=${extraction.lockupCount}, cards=${extraction.count}`);
    } else if(isForeground && extraction.lockupCount > 0){
      // 前台但只有骨架：稍等后滚动触发懒加载
      console.error(`  前台 tab，${extraction.lockupCount} 个骨架，稍等后滚动...`);
      await sleep(3000);
      await page.evaluate('window.scrollBy(0, 1200)');
      await sleep(5000);
      extraction = await extractRecruiterCards(page);
      console.error(`  滚动后: lockups=${extraction.lockupCount}, cards=${extraction.count}`);
    } else if(!isForeground){
      // 后台 tab：长等待（JS 被严重节流）
      console.error('  后台 tab，长等待内容填充...');
      let waitRounds = 0;
      while(waitRounds < 6){
        await sleep(5000);
        extraction = await extractRecruiterCards(page);
        console.error(`  [${(waitRounds + 1) * 5}s] lockups=${extraction.lockupCount}, cards=${extraction.count}`);
        if(extraction.count > 0) break;
        waitRounds++;
      }
    }

    // 滚动触发更多懒加载内容
    if(extraction.count < extraction.lockupCount || extraction.lockupCount < 10){
      console.error('  滚动触发更多内容...');
      await page.evaluate('window.scrollBy(0, 1500)');
      await sleep(3000);
      await page.evaluate('window.scrollBy(0, 1500)');
      await sleep(3000);
      extraction = await extractRecruiterCards(page);
      console.error(`  滚动后: lockups=${extraction.lockupCount}, cards=${extraction.count}`);
    }

    // ========== Phase C: 筛选条件说明 ==========
    if(inputSearchUrl){
      if(jobTitles || location || companies || skills || keywords){
        console.error('\n--- Phase C: 筛选条件来自 searchUrl ---');
        console.error('  说明: searchUrl 已包含所有筛选，忽略 jobTitles/location 等参数');
      }
    } else {
      // LinkedIn Recruiter 后台 tab 节流导致 Ember.js facet UI 事件不处理
      // 所有筛选通过 boolean 语法直接写入 searchBoolean 参数，无需 facet 面板交互
      const hasFilters = jobTitles || location || companies || skills || keywords;
      if(hasFilters){
        console.error('\n--- Phase C: 筛选条件已拼入搜索表达式 ---');
        console.error('  说明: 后台 tab JS 节流，facet UI 交互不可靠，改用 boolean 语法');
      }
    }

    // ========== Phase D: 提取结果与分页 ==========
    console.error('\n--- Phase D: 提取候选人 ---');
    let allCandidates = [];
    const maxPages = Math.min(Math.ceil(limit / 25) + 2, 10);

    for(let pageNum = 1; pageNum <= maxPages; pageNum++){
      extraction = await extractRecruiterCards(page);
      var totalInfo = extraction.totalText ? ` (${extraction.totalText})` : '';
      console.error(`  第 ${pageNum} 页: ${extraction.count} 张卡片${totalInfo}`);

      if(extraction.count > 0){
        const existingIds = new Set(allCandidates.map(c => c.profileId));
        const newCards = extraction.cards.filter(c => c.profileId && !existingIds.has(c.profileId));
        allCandidates.push(...newCards);
        console.error(`    +${newCards.length} 个新候选人（累计 ${allCandidates.length}）`);
      }

      if(allCandidates.length >= limit){
        console.error('  已达数量上限，停止');
        break;
      }

      if(pageNum < maxPages){
        // 记录当前页 URL 的 start 参数
        const beforeUrl = await page.evaluate('window.location.href');
        const beforeStart = (beforeUrl.match(/[?&]start=(\d+)/) || [])[1] || '0';

        const hasNext = await clickNextPage(page);
        if(hasNext){
          console.error('  点击下一页...');
          // 循环等待翻页完成（URL 的 start 参数变化 + Loading 结束）
          let flipRounds = 0;
          let flipped = false;
          while(flipRounds < 12){
            await sleep(3000);
            const afterUrl = await page.evaluate('window.location.href');
            const afterStart = (afterUrl.match(/[?&]start=(\d+)/) || [])[1] || '0';
            const afterState = await page.evaluate(`(function(){
              var container = document.querySelector('#results-container');
              return {
                hasLoading: document.body.innerText.indexOf('Loading') >= 0,
                hasStartSearch: document.body.innerText.indexOf('Start a search') >= 0,
                lockupCount: container ? container.querySelectorAll('.artdeco-entity-lockup').length : 0
              };
            })()`);
            if(afterStart !== beforeStart && !afterState.hasLoading && afterState.lockupCount > 0){
              console.error(`    翻页成功: start=${beforeStart} -> ${afterStart}, lockups=${afterState.lockupCount}`);
              // 翻页后滚动触发懒加载
              await page.evaluate('window.scrollBy(0, 1200)');
              await sleep(2000);
              await page.evaluate('window.scrollBy(0, 1200)');
              await sleep(3000);
              flipped = true;
              break;
            }
            flipRounds++;
          }
          if(!flipped){
            console.error('    翻页验证失败，停止分页');
            break;
          }
        } else {
          console.error('  无下一页按钮');
          break;
        }
      }
    }

    console.error(`\n共提取 ${allCandidates.length} 个候选人`);

    if(allCandidates.length === 0){
      console.error('未找到候选人');
      if(extraction.url) console.error(`  URL: ${extraction.url.substring(0, 100)}`);
    }

    // ========== Phase E: 保存结果 ==========
    const result = {
      timestamp: new Date().toISOString(),
      platform: 'linkedin-recruiter',
      params: { keyword, searchUrl: inputSearchUrl, jobTitles, location, companies, skills, keywords, limit },
      summary: { total: allCandidates.length, tag },
      candidates: allCandidates.slice(0, limit)
    };

    // raw 模式或指定 output：只输出 JSON
    if(raw || output){
      const outPath = output || RESULT_FILE;
      ensureConfigDir();
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.error(`\n结果已保存: ${outPath}`);
      return { success: true, count: allCandidates.length, output: outPath };
    }

    // 标准模式：写 tags.csv + result.json
    ensureConfigDir();
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    console.error(`\n结果已保存: ${RESULT_FILE}`);

    if(allCandidates.length > 0){
      console.error(`\n打标签: ${tag}`);
      let tagged = 0;
      for(const c of allCandidates.slice(0, limit)){
        if(c.profileId){
          writeTagsToCSV(c.profileId, c.name, tag, { keyword, location });
          tagged++;
        }
      }
      console.error(`已标记 ${tagged} 个候选人`);
    }

    // 输出摘要表格
    console.error('\n' + '='.repeat(80));
    console.error('候选人列表');
    console.error('='.repeat(80));
    console.error('  序号  姓名              职位                     地点        链接');
    console.error('  ----  ----------------  -----------------------  ----------  ------------------------------');
    allCandidates.slice(0, 20).forEach((c, i) => {
      const idx = String(i + 1).padStart(2, ' ');
      const name = (c.name || '-').substring(0, 16).padEnd(16, ' ');
      const title = (c.headline || '-').substring(0, 23).padEnd(23, ' ');
      const loc = (c.location || '-').substring(0, 10).padEnd(10, ' ');
      const url = c.profileId ? getProfileUrl(linkedinTier, c.profileId) : '-';
      console.error(`  ${idx}   ${name}  ${title}  ${loc}  ${url}`);
    });

    return { success: true, count: allCandidates.length, tag };
  }
});
