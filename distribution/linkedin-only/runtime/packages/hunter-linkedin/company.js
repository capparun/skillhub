import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readEmployeeCards, normalizeEmployeeCards } from './lib/company-employees.js';
import {
  getLinkedInTier,
  getTierConfig,
  TAGS_CSV_HEADER,
  buildComplianceFields,
  formatTagsCsvRow,
  getCompanySearchUrl,
  getCompanyPageUrl,
  validateTier,
} from './lib/index.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const CONFIG_DIR = path.join(os.homedir(), '.hunter', 'channels', 'linkedin');
const LINKEDIN_TAGS_FILE = path.join(CONFIG_DIR, 'linkedin-tags.csv');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function generateTag(prefix = 'LC') {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${prefix}${mm}${dd}`;
}

function writeTagsToCSV(profileId, name, tag, searchParams) {
  ensureConfigDir();
  const isNewFile = !fs.existsSync(LINKEDIN_TAGS_FILE);
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const newLine = formatTagsCsvRow({
    profileId,
    name: name || '?',
    tags: tag,
    keyword: searchParams.keyword || '',
    location: searchParams.location || '',
    time: timestamp,
    platform: 'linkedin',
    ...buildComplianceFields('linkedin-company'),
  });
  if (isNewFile) fs.writeFileSync(LINKEDIN_TAGS_FILE, TAGS_CSV_HEADER + newLine);
  else fs.appendFileSync(LINKEDIN_TAGS_FILE, newLine);
}

// 从公司页面提取员工列表
async function extractEmployeesFromPage(page) {
  return normalizeEmployeeCards(await page.evaluate(readEmployeeCards));
}

// 滚动加载更多员工
async function scrollAndLoadEmployees(page, maxEmployees) {
  const allEmployees = [];
  const seenIds = new Set();
  let scrollCount = 0;
  const maxScroll = Math.ceil(maxEmployees / 10) + 3;

  while (allEmployees.length < maxEmployees && scrollCount < maxScroll) {
    const employees = await extractEmployeesFromPage(page);
    let newCount = 0;

    for (const emp of employees) {
      if (!seenIds.has(emp.profileId)) {
        seenIds.add(emp.profileId);
        allEmployees.push(emp);
        newCount++;
      }
    }

    if (allEmployees.length >= maxEmployees) break;

    // 滚动
    await page.evaluate(() => {
      const main = document.querySelector('main#workspace');
      const scroller = main && /auto|scroll/.test(getComputedStyle(main).overflowY) ? main : document.scrollingElement;
      if (scroller) scroller.scrollTop += Math.max(500, scroller.clientHeight);
    });
    await sleep(2000);

    // 尝试点击"显示更多"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(button =>
        button.matches('[class*="scaffold-finite-scroll__load-button"]') ||
        /显示更多结果|show more results/i.test(button.textContent || '')
      );
      if (btn) btn.click();
    });

    scrollCount++;
  }

  return allEmployees.slice(0, maxEmployees);
}

cli({
  site: 'hunter-linkedin',
  name: 'company',
  access: 'write',
  description: '搜索目标公司员工列表',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'company', type: 'string', required: true, description: '公司名称' },
    { name: 'keyword', type: 'string', default: '', description: '职位关键词筛选' },
    { name: 'location', type: 'string', default: '', description: '地点筛选' },
    { name: 'limit', type: 'int', default: 20, description: '获取员工数量' },
    { name: 'autoTag', type: 'boolean', default: true, description: '自动打标签' },
    { name: 'tagPrefix', type: 'string', default: 'LC', description: '标签前缀' },
    { name: 'skipTierCheck', type: 'boolean', default: false, description: '跳过 LinkedIn 账号档位校验' },
  ],
  func: async (page, kwargs) => {
    console.error('\n================================================================================');
    console.error('🏢 LinkedIn 公司人才搜索');
    console.error('================================================================================\n');

    const { company, keyword, location, limit, autoTag, tagPrefix } = kwargs;
    const linkedinTier = getLinkedInTier();
    const tierCfg = getTierConfig(linkedinTier);
    console.error(`🔍 账号档位: ${tierCfg.label}`);

    if (!kwargs.skipTierCheck) {
      const v = await validateTier(page, linkedinTier);
      if (v.severity === 'error') {
        console.error(`\n❌ ${v.mismatchReason}`);
        return { success: false, error: 'tier_mismatch', details: v };
      }
      if (v.severity === 'warning') {
        console.error(`\n⚠️  ${v.mismatchReason}`);
      }
    }

    // 构建搜索URL - 使用公司搜索
    const searchUrl = getCompanySearchUrl(linkedinTier, company);

    console.error(`🔍 搜索公司: "${company}"`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);

    const currentUrl = await page.evaluate(`window.location.href`);
    if (currentUrl.includes('login')) {
      console.error('❌ 未登录');
      return { success: false, error: 'not_logged_in' };
    }

    // 查找公司链接
    const companyResult = await page.evaluate((companyName) => {
      const links = Array.from(document.querySelectorAll('a[href*="/company/"]'));
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        const href = link.href || '';
        if (text.includes(companyName.toLowerCase()) && href.includes('/company/')) {
          return { name: companyName, url: href };
        }
      }
      return null;
    }, company);

    if (!companyResult) {
      console.error(`❌ 未找到公司: ${company}`);
      console.error('   提示: 尝试使用公司英文名或更精确的搜索词\n');
      return { success: false, error: 'company_not_found' };
    }

    console.error(`✓ 找到公司: ${companyResult.name}`);
    console.error(`  链接: ${companyResult.url}\n`);

    // 访问公司员工页面
    const employeesUrl = getCompanyPageUrl(linkedinTier, companyResult.url.replace(/.*\/company\//, '').replace(/\/.*$/, '')) + 'people/';
    let targetUrl = employeesUrl;
    if (keyword) targetUrl += `?keywords=${encodeURIComponent(keyword)}`;

    console.error(`👥 正在获取员工列表...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(5000);

    // 提取员工列表
    const employees = await scrollAndLoadEmployees(page, limit);

    console.error(`✓ 共找到 ${employees.length} 位员工\n`);

    if (employees.length === 0) {
      console.error('❌ 未找到员工');
      console.error('   可能原因: 公司页面限制、需要登录、或公司无公开员工列表\n');
      return { success: false, error: 'no_employees' };
    }

    // 评估员工
    const keywords = keyword.toLowerCase().split(/[\s,]+/).filter(k => k.length > 1);
    const evaluated = employees.map(emp => {
      let score = 0;
      const text = (emp.name + ' ' + emp.title + ' ' + emp.location).toLowerCase();

      keywords.forEach(kw => {
        if (text.includes(kw)) score += 20;
      });

      // 默认基础分
      if (keywords.length === 0) score = 30;

      return { ...emp, score, matched: score >= 30 };
    });

    const matched = evaluated.filter(e => e.matched);

    // 自动打标签
    let tag = '';
    if (autoTag && matched.length > 0) {
      tag = generateTag(tagPrefix);
      console.error(`🏷️  标签: ${tag}`);
      matched.forEach(e => writeTagsToCSV(e.profileId, e.name, tag, { keyword: `${company} ${keyword}`, location }));
      console.error(`✓ 已标记 ${matched.length} 人\n`);
    }

    // 输出表格
    console.error('📋 员工列表:\n');
    console.error('  ┌────┬────────────────────┬──────────────────────────────┬────────┬────────────────────────────┐');
    console.error('  │ 序号 │ 姓名               │ 职位                         │ 匹配度 │ 主页链接                   │');
    console.error('  ├────┼────────────────────┼──────────────────────────────┼────────┼────────────────────────────┤');

    evaluated.slice(0, 20).forEach((e, i) => {
      const idx = String(i + 1).padStart(2, ' ').padEnd(4, ' ');
      const nameStr = (e.name || '-').substring(0, 16).padEnd(16, ' ');
      const titleStr = (e.title || '-').substring(0, 26).padEnd(26, ' ');
      const scoreStr = String(e.score).padStart(2, ' ').padEnd(6, ' ');
      const urlStr = (e.profileId || '-').substring(0, 24).padEnd(24, ' ');
      console.error(`  │ ${idx} │ ${nameStr} │ ${titleStr} │ ${scoreStr} │ ${urlStr} │`);
    });

    console.error('  └────┴────────────────────┴──────────────────────────────┴────────┴────────────────────────────┘\n');

    console.error('================================================================================');
    console.error('💡 快速操作');
    console.error('================================================================================');
    console.error('');
    if (tag) {
      console.error(`  查看列表:   opencli hunter linkedin-list --tag ${tag}`);
      console.error(`  批量查看:   opencli hunter linkedin-batch-view --tag ${tag}`);
      console.error(`  导出数据:   opencli hunter linkedin-export --tag ${tag} --format csv`);
    }
    console.error(`  查看公司页: opencli hunter linkedin-view --url ${companyResult.url}`);
    console.error(`  重新搜索:   opencli hunter linkedin-company --company "${company}" --keyword "Engineer"\n`);

    return {
      success: true,
      company: companyResult.name,
      companyUrl: companyResult.url,
      total: employees.length,
      matched: matched.length,
      tag,
      employees: evaluated.slice(0, 10)
    };
  },
});
