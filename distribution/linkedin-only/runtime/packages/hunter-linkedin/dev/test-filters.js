import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CONFIG_DIR = path.join(os.homedir(), '.hunter', 'channels', 'linkedin');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

cli({
  site: 'hunter-linkedin',
  name: 'test-filters',
  access: 'read',
  description: '测试 LinkedIn 筛选功能：应用所有筛选项后截图暂停',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', required: true, description: '搜索关键词' },
    { name: 'connection', type: 'string', default: '2nd', description: '人脉筛选: 1st/2nd/3rd' },
    { name: 'location', type: 'string', default: '中国', description: '地点筛选' },
    { name: 'currentCompany', type: 'string', default: '微软', description: '目前就职公司' },
    { name: 'pastCompany', type: 'string', default: '谷歌', description: '曾经就职公司' },
    { name: 'school', type: 'string', default: '清华大学', description: '学校筛选' },
    { name: 'industry', type: 'string', default: '软件开发', description: '所属行业' },
    { name: 'language', type: 'string', default: '中文', description: '档案语言' },
    { name: 'serviceCategory', type: 'string', default: '', description: '服务类别' },
  ],
  func: async (page, kwargs) => {
    const { keyword, connection, location: loc, currentCompany, pastCompany, school, industry, language, serviceCategory } = kwargs;

    console.log('='.repeat(60));
    console.log('LinkedIn 筛选功能测试');
    console.log('='.repeat(60));

    const baseUrl = 'https://www.linkedin.com/search/results/people/';
    const params = new URLSearchParams();
    params.set('keywords', keyword);
    const searchUrl = `${baseUrl}?${params.toString()}`;
    console.log(`搜索URL: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);

    const currentUrl = await page.evaluate('window.location.href');
    if (currentUrl.includes('login') || currentUrl.includes('authwall')) {
      console.log('未登录 LinkedIn');
      return { success: false, error: 'not_logged_in' };
    }

    console.log('页面已加载');

    ensureConfigDir();
    const beforePath = path.join(CONFIG_DIR, 'test-filters-before.png');
    await page.screenshot({ path: beforePath, fullPage: true });
    console.log(`筛选前截图: ${beforePath}`);

    const filters = [];

    // ========== 1. 打开"全部筛选条件"面板 ==========
    console.log('\n打开"全部筛选条件"面板...');
    const panelOpened = await page.evaluate(`(function() {
      var keywords = ['全部筛选条件', 'All filters'];
      var all = Array.from(document.querySelectorAll('*'));
      for (var i = 0; i < all.length; i++) {
        var text = (all[i].textContent || '').trim().replace(/\\s+/g, ' ');
        for (var j = 0; j < keywords.length; j++) {
          if (text === keywords[j] || text.indexOf(keywords[j]) >= 0) {
            var el = all[i];
            for (var d = 0; d < 5; d++) {
              if (!el) break;
              var tag = el.tagName.toLowerCase();
              if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
                el.click();
                return JSON.stringify({ clicked: true, text: text, method: d === 0 ? 'direct' : 'ancestor' + d });
              }
              el = el.parentElement;
            }
          }
        }
      }
      return JSON.stringify({ clicked: false });
    })()`);
    const panelResult = JSON.parse(panelOpened);
    if (!panelResult.clicked) {
      console.log('  未找到"全部筛选条件"按钮');
    } else {
      console.log(`  面板已打开 (${panelResult.method || 'direct'}: "${panelResult.text}")`);
    }

    await sleep(3000);

    // 滚动右侧筛选面板
    console.log('\n滚动面板...');
    for (var scrollRound = 0; scrollRound < 6; scrollRound++) {
      await page.evaluate(`(function() {
        var all = Array.from(document.querySelectorAll('*'));
        var bestPanel = null;
        var bestScore = 0;
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          var rect = el.getBoundingClientRect();
          var style = window.getComputedStyle(el);
          if (rect.left > window.innerWidth * 0.5 && rect.height > 200) {
            var score = rect.height;
            if (style.position === 'fixed' || style.position === 'absolute') score += 1000;
            if (el.scrollHeight > el.clientHeight) score += 500;
            if (score > bestScore) { bestScore = score; bestPanel = el; }
          }
        }
        if (bestPanel) { bestPanel.scrollBy(0, 400); return 'scrolled'; }
        var aside = document.querySelector('aside');
        if (aside) { aside.scrollBy(0, 400); return 'aside'; }
        return 'none';
      })()`);
      await sleep(500);
    }
    await sleep(1000);

    // 截图：面板打开后
    const panelPath = path.join(CONFIG_DIR, 'test-filters-panel.png');
    await page.screenshot({ path: panelPath, fullPage: true });
    console.log(`面板截图: ${panelPath}`);

    // ========== 2. 在面板中应用筛选 ==========
    if (panelResult.clicked) {
      // 人脉
      if (connection) {
        const connMap = { '1st': '1度', '2nd': '2度', '3rd': '3度+', '3rd+': '3度+' };
        const connLabel = connMap[connection.trim().toLowerCase()];
        if (connLabel && await clickCheckboxByLabel({ sectionKeywords: ['好友', 'Connections'], labelValue: connLabel, fieldName: '人脉' })) {
          filters.push(`connection=${connLabel}`);
        }
      }

      // 地点
      if (await clickCheckboxByLabel({ sectionKeywords: ['地点', 'Location'], labelValue: loc, fieldName: '地点' })) {
        filters.push(`location=${loc}`);
      }

      // 目前就职公司
      if (await clickCheckboxByLabel({ sectionKeywords: ['目前就职公司', 'Current company'], labelValue: currentCompany, fieldName: '目前就职公司' })) {
        filters.push(`currentCompany=${currentCompany}`);
      }

      // 曾经就职公司
      if (await clickCheckboxByLabel({ sectionKeywords: ['曾经就职公司', 'Past company'], labelValue: pastCompany, fieldName: '曾经就职公司' })) {
        filters.push(`pastCompany=${pastCompany}`);
      }

      // 学校
      if (await clickCheckboxByLabel({ sectionKeywords: ['学校', 'School'], labelValue: school, fieldName: '学校' })) {
        filters.push(`school=${school}`);
      }

      // 行业
      if (await clickCheckboxByLabel({ sectionKeywords: ['所属行业', '行业', 'Industry'], labelValue: industry, fieldName: '行业' })) {
        filters.push(`industry=${industry}`);
      }

      // 档案语言
      if (await clickCheckboxByLabel({ sectionKeywords: ['档案语言', '语言', 'Profile language'], labelValue: language, fieldName: '档案语言' })) {
        filters.push(`language=${language}`);
      }

      // 服务类别
      if (serviceCategory && await clickCheckboxByLabel({ sectionKeywords: ['服务类别', '服务', 'Services'], labelValue: serviceCategory, fieldName: '服务类别' })) {
        filters.push(`serviceCategory=${serviceCategory}`);
      }

      // 点击"显示结果"
      console.log('\n点击"显示结果"...');
      const applied = await page.evaluate(`(function() {
        var texts = ['显示结果', 'Show results', 'Apply', 'Done'];
        var btns = Array.from(document.querySelectorAll('button, [role="button"], a'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent.trim();
          for (var j = 0; j < texts.length; j++) {
            if (t === texts[j] || t.indexOf(texts[j]) >= 0) {
              btns[i].click();
              return JSON.stringify({ found: true, text: t, method: 'button' });
            }
          }
        }
        var all = Array.from(document.querySelectorAll('*'));
        for (var i = 0; i < all.length; i++) {
          var t = (all[i].textContent || '').trim();
          for (var j = 0; j < texts.length; j++) {
            if (t === texts[j] || t.indexOf(texts[j]) >= 0) {
              var el = all[i];
              for (var d = 0; d < 5; d++) {
                if (!el) break;
                var tag = el.tagName.toLowerCase();
                if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
                  el.click();
                  return JSON.stringify({ found: true, text: t, method: 'ancestor' + d });
                }
                el = el.parentElement;
              }
            }
          }
        }
        return JSON.stringify({ found: false });
      })()`);
      var applyResult = JSON.parse(applied);
      if (applyResult.found) {
        console.log(`  已应用 (${applyResult.method}: "${applyResult.text}")`);
        await sleep(3000);
      } else {
        console.log('  未找到应用按钮');
      }
    }

    // ========== 辅助函数：在面板中勾选复选框 ==========
    async function clickCheckboxByLabel({ sectionKeywords, labelValue, fieldName }) {
      if (!labelValue) return false;
      console.log(`\n${fieldName}: ${labelValue}`);

      const result = await page.evaluate(`(function() {
        var sectionKws = ${JSON.stringify(Array.isArray(sectionKeywords) ? sectionKeywords : [sectionKeywords])};
        var targetText = ${JSON.stringify(labelValue)};
        var targetNoSpace = targetText.replace(/\\s/g, '');

        var allEls = Array.from(document.querySelectorAll('*'));

        // 1. 找区域标题
        var sectionIdx = -1;
        for (var i = 0; i < allEls.length; i++) {
          var t = (allEls[i].textContent || '').trim();
          for (var j = 0; j < sectionKws.length; j++) {
            if (t === sectionKws[j] || t.indexOf(sectionKws[j]) >= 0) {
              sectionIdx = i;
              break;
            }
          }
          if (sectionIdx >= 0) break;
        }

        // 2. 在区域内搜索：先找文字匹配的元素，再在周围找 checkbox
        function findCheckbox(el) {
          if (!el) return null;
          var cb = el.querySelector('input[type="checkbox"]');
          if (cb) return cb;
          if (el.parentElement) {
            cb = el.parentElement.querySelector('input[type="checkbox"]');
            if (cb) return cb;
          }
          if (el.parentElement && el.parentElement.parentElement) {
            cb = el.parentElement.parentElement.querySelector('input[type="checkbox"]');
            if (cb) return cb;
          }
          if (el.previousElementSibling) {
            cb = el.previousElementSibling.querySelector('input[type="checkbox"]');
            if (cb) return cb;
          }
          if (el.nextElementSibling) {
            cb = el.nextElementSibling.querySelector('input[type="checkbox"]');
            if (cb) return cb;
          }
          if (el.parentElement) {
            var children = Array.from(el.parentElement.children);
            for (var k = 0; k < children.length; k++) {
              cb = children[k].querySelector('input[type="checkbox"]');
              if (cb) return cb;
            }
          }
          return null;
        }

        var candidates = [];
        for (var i = (sectionIdx >= 0 ? sectionIdx : 0); i < allEls.length; i++) {
          var el = allEls[i];
          var t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
          var tNoSpace = t.replace(/\\s/g, '');
          var match = (t === targetText) || (tNoSpace === targetNoSpace);
          if (!match && t.length <= targetText.length + 10 && t.indexOf(targetText) >= 0) {
            match = true;
          }
          if (!match && tNoSpace.length <= targetNoSpace.length + 10 && tNoSpace.indexOf(targetNoSpace) >= 0) {
            match = true;
          }

          if (match) {
            var cb = findCheckbox(el);
            if (cb) {
              candidates.push({ cb: cb, text: t, idx: i });
            }
          }
        }

        if (candidates.length === 0) return JSON.stringify({ found: false, reason: 'no_match' });

        // 优先选择区域标题后面的第一个匹配项
        var chosen = candidates[0];
        if (sectionIdx >= 0) {
          for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].idx > sectionIdx) {
              chosen = candidates[i];
              break;
            }
          }
        }

        // 3. 模拟真实鼠标点击（触发 React 事件）
        var rect = chosen.cb.getBoundingClientRect();
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        var mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y });
        var mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
        var click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
        chosen.cb.dispatchEvent(mousedown);
        chosen.cb.dispatchEvent(mouseup);
        chosen.cb.dispatchEvent(click);

        return JSON.stringify({ found: true, text: chosen.text.substring(0, 40) });
      })()`);

      const r = JSON.parse(result);
      if (!r.found) {
        console.log(`  未找到: ${r.reason}`);
        return false;
      }
      console.log(`  已勾选: "${r.text}"`);
      await sleep(1000);
      return true;
    }

    console.log(`\n已应用 ${filters.length} 个筛选条件: ${filters.join(', ')}`);

    await sleep(2000);

    const afterPath = path.join(CONFIG_DIR, 'test-filters-after.png');
    await page.screenshot({ path: afterPath, fullPage: true });
    console.log(`筛选后截图: ${afterPath}`);

    const filteredUrl = await page.evaluate('window.location.href');
    console.log(`\n筛选后URL: ${filteredUrl.substring(0, 200)}...`);

    console.log('\n测试完成，浏览器保持打开状态');

    return {
      success: true,
      filtersApplied: filters,
      beforeScreenshot: beforePath,
      afterScreenshot: afterPath,
      panelScreenshot: panelPath,
      finalUrl: filteredUrl,
    };
  }
});
