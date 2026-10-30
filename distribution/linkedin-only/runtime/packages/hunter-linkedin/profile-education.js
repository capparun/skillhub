import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  anchorSectionUrl,
  buildEducationExtractionScript,
  normalizeEducationRows,
} from './lib/anchor-sections.js';

const fail = (code, message) => { throw Object.assign(new Error(message ?? code), { code }); };

cli({
  site: 'hunter-linkedin',
  name: 'profile-education',
  description: '读取 LinkedIn 主页的 /details/education/ 锚点页，返回结构化教育经历（学校、学位、时间）',
  domain: 'www.linkedin.com',
  access: 'read',
  browser: true,
  strategy: Strategy.COOKIE,
  args: [
    { name: 'profile-url', type: 'string', required: true, help: 'LinkedIn /in/<handle>/ 主页 URL' },
  ],
  columns: ['rank', 'school', 'degree', 'date_range', 'start_date', 'end_date', 'description', 'raw_text', 'profile_url'],
  func: async (page, args) => {
    if (!page) fail('browser_session_required');
    const profileUrl = String(args['profile-url'] ?? '');
    const target = anchorSectionUrl(profileUrl, 'education');
    await page.goto(target);
    const state = await page.evaluate('({url: location.href, title: document.title})');
    const marker = `${state?.url ?? ''} ${state?.title ?? ''}`;
    if (/\/checkpoint/i.test(marker)) fail('verification_required');
    if (/\/login|\/authwall|LinkedIn Login/i.test(marker)) fail('not_logged_in');
    try { await page.wait({ text: 'Education', timeout: 8000 }); } catch { /* a profile may have no education section */ }
    const { items, diagnostics } = normalizeEducationRows(await page.evaluate(buildEducationExtractionScript()));
    // When the anchor page yields nothing, keep a local diagnostic so an empty result
    // can be told apart from a parser miss without another page load.
    const debugFile = process.env.HUNTER_ANCHOR_DEBUG_FILE;
    if (debugFile) {
      const fs = await import('node:fs');
      fs.writeFileSync(debugFile, JSON.stringify({ profile_url: profileUrl, items_count: items.length, diagnostics }, null, 2) + '\n');
    }
    return items.map(item => ({ ...item, profile_url: profileUrl }));
  },
});
