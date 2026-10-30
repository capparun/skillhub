import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  anchorSectionUrl,
  buildEducationExtractionScript,
  experienceText,
  normalizeEducationRows,
} from './lib/anchor-sections.js';
import { createPacer } from './lib/pacing.js';

const fail = (code, message) => { throw Object.assign(new Error(message ?? code), { code }); };

// Mirrors the bundled linkedin profile-read extraction so batch rows keep the same fields.
function buildProfileExtractionScript() {
  return String.raw`(() => {
    const clean = (s) => String(s || '').replace(/[\u00a0\u202f]+/g, ' ').replace(/\s+/g, ' ').trim();
    const compact = (s) => {
      const text = clean(s);
      if (!text) return '';
      if (text.length % 2 === 0 && text.slice(0, text.length / 2) === text.slice(text.length / 2)) {
        return text.slice(0, text.length / 2);
      }
      return text;
    };
    const readSection = (headingPattern) => {
      const headings = Array.from(document.querySelectorAll('section h2, section h3, h2, h3'));
      const heading = headings.find((el) => headingPattern.test(clean(el.innerText || el.textContent || '')));
      const section = heading?.closest('section');
      if (!section) return '';
      const text = clean(section.innerText || section.textContent || '');
      return clean(text.replace(headingPattern, '').replace(/\bShow all.*$/i, '').replace(/\bSee more.*$/i, ''));
    };
    const nameHeading = document.querySelector('main h1, main h2');
    const intro = nameHeading?.closest('section') || document.querySelector('main section') || document.body;
    const lines = (intro.innerText || intro.textContent || '').split(/\n+/).map(clean).filter(Boolean);
    const name = compact(clean(nameHeading?.innerText || nameHeading?.textContent || lines[0] || ''));
    const skipIntro = (line) => !line
      || line === name
      || /^(1st|2nd|3rd|contact info|message|more|follow|connect|open to|add section|enhance profile|resources|self employed)$/i.test(line)
      || /^\d[\d,]*\s+(followers|connections)/i.test(line)
      || line === '·';
    const headline = compact(lines.find((line) => !skipIntro(line) && line.length > 20) || '');
    const locationText = lines.find((line) => /(area|india|jaipur|bangalore|bengaluru|delhi|mumbai|hyderabad|pune)/i.test(line) && line.length < 120) || '';
    const about = readSection(/^About$/i);
    const experience = readSection(/^Experience$/i);
    const education = readSection(/^Education$/i);
    const featured = readSection(/^Featured$/i);
    const services = readSection(/^Services$/i) || readSection(/^Providing services$/i);
    return { profile_url: window.location.href, name, headline, location: locationText, about, experience, education, services, featured };
  })()`;
}

function normalizeProfileUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('invalid_profile_url'); }
  if (url.origin !== 'https://www.linkedin.com' || url.username || url.password || url.search || url.hash || !/^\/in\/[^/?#]+\/?$/.test(url.pathname)) fail('invalid_profile_url');
  url.pathname = url.pathname.replace(/\/?$/, '/');
  return url.href;
}

const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

// Readiness replaces fixed waits: return as soon as the name and at least two
// profile sections are rendered; waitSeconds is only the slow-page hard cap.
const readinessScript = `(() => {
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const name = clean((document.querySelector('main h1, main h2') || {}).textContent || '');
  const sections = ['About', 'Experience', 'Education'].map((title) => {
    const heading = Array.from(document.querySelectorAll('section h2, section h3, h2, h3'))
      .find((el) => new RegExp('^' + title + '$', 'i').test(clean(el.textContent || '')));
    return heading ? 1 : 0;
  }).join('');
  return { nameReady: Boolean(name), sections, loading: Boolean(document.querySelector('[aria-busy="true"]')) };
})()`;

async function waitForProfile(page, maxSeconds = 8) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(readinessScript);
    const readyCount = String(state?.sections ?? '').split('').filter(flag => flag === '1').length;
    if (state?.nameReady && !state?.loading && readyCount >= 2) return state;
    // A profile without About/Experience sections still becomes readable after a short wait.
    if (state?.nameReady && Date.now() - started >= 2000) return state;
    if (Date.now() - started >= Math.max(1, maxSeconds) * 1000) return state;
    await sleepMs(250);
  }
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function normalizeRow(row, expectedUrl) {
  if (!row || typeof row !== 'object') fail('malformed_profile_payload');
  const name = clean(row.name);
  if (!name) fail('profile_unreadable');
  return {
    profile_url: clean(row.profile_url) || expectedUrl,
    name,
    headline: clean(row.headline),
    location: clean(row.location),
    about: clean(row.about),
    experience: clean(row.experience),
    education: clean(row.education),
    experience_items: Array.isArray(row.experience_items) ? row.experience_items : [],
    education_items: Array.isArray(row.education_items) ? row.education_items : [],
    services: clean(row.services),
    featured: clean(row.featured),
  };
}

function fatalCode(pageState) {
  const target = `${pageState?.url ?? ''} ${pageState?.title ?? ''}`;
  if (/\/checkpoint/i.test(target)) return 'verification_required';
  if (/\/login|\/authwall|\/uas\/login|LinkedIn Login/i.test(target)) return 'not_logged_in';
  return null;
}

function readCheckpoint(file) {
  if (!fs.existsSync(file)) return new Map();
  const done = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.profile_url) done.set(entry.profile_url, entry.status ?? 'ok');
    } catch { /* ignore a truncated trailing line */ }
  }
  return done;
}

async function assertNoFatal(page) {
  const state = await page.evaluate('({url: location.href, title: document.title})');
  const fatal = fatalCode(state);
  if (fatal) fail(fatal);
}

// Detail reading follows the profile's own anchor pages instead of scrolling the
// main profile: basics come from /in/<handle>/, the structured lists come from
// /details/experience/ (bundled command) and /details/education/.
export async function readProfileFromPage(page, url, waitSeconds, { getCommand } = {}) {
  await page.goto(url);
  await assertNoFatal(page);
  await waitForProfile(page, waitSeconds);
  const basics = await page.evaluate(buildProfileExtractionScript());

  let experienceItems = [];
  const experienceCommand = getCommand?.('linkedin/profile-experience');
  if (experienceCommand?.func) {
    const result = await experienceCommand.func(page, { 'profile-url': url });
    experienceItems = Array.isArray(result) ? result : result ? [result] : [];
    await assertNoFatal(page);
  }

  await page.goto(anchorSectionUrl(url, 'education'));
  await assertNoFatal(page);
  try { await page.wait({ text: 'Education', timeout: 5000 }); } catch { /* a profile may have no education section */ }
  const education = normalizeEducationRows(await page.evaluate(buildEducationExtractionScript()));

  return {
    ...basics,
    experience: experienceText(experienceItems) || clean(basics.experience),
    education: education.text || clean(basics.education),
    experience_items: experienceItems,
    education_items: education.items,
  };
}

export async function runProfileBatch({ page, urls, outputDir, resumeFile, waitSeconds = 8, limit, readProfile, pacer = null, sleep = sleepMs } = {}) {
  if (!readProfile && !page) fail('browser_session_required');
  if (!Array.isArray(urls) || !urls.length) fail('profile_urls_required');
  const selected = [...new Set(urls.map(normalizeProfileUrl))].slice(0, Number.isInteger(limit) ? limit : undefined);
  fs.mkdirSync(outputDir, { recursive: true });
  const checkpoint = resumeFile ?? path.join(outputDir, 'checkpoint.jsonl');
  const done = readCheckpoint(checkpoint);
  const pending = selected.filter(url => !done.has(url));
  const rows = [];
  let stopped = null;
  const readOne = readProfile ?? (url => readProfileFromPage(page, url, waitSeconds));
  for (const [index, url] of pending.entries()) {
    const wait = pacer ? pacer.delayBefore(index) : { ms: 0, kind: 'none' };
    if (wait.ms > 0) await sleep(wait.ms);
    const started = Date.now();
    try {
      rows.push(await readOne(url));
      fs.appendFileSync(checkpoint, JSON.stringify({ profile_url: url, status: 'ok', wait_ms: wait.ms, wait_kind: wait.kind, duration_ms: Date.now() - started }) + '\n');
    } catch (error) {
      const code = error?.code ?? 'profile_read_failed';
      fs.appendFileSync(checkpoint, JSON.stringify({ profile_url: url, status: 'failed', error: code, wait_ms: wait.ms, wait_kind: wait.kind, duration_ms: Date.now() - started }) + '\n');
      if (['not_logged_in', 'verification_required', 'AUTH_REQUIRED'].includes(code) || /not logged in|authwall|checkpoint|login|AUTH_REQUIRED/i.test(error?.message ?? '')) {
        stopped = code === 'profile_read_failed' ? 'not_logged_in' : code;
        break;
      }
    }
  }
  const resultsFile = path.join(outputDir, 'profiles.json');
  const existing = (() => {
    try {
      const parsed = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();
  const merged = new Map(existing.map(row => [row.profile_url, row]));
  for (const row of rows) merged.set(row.profile_url, row);
  fs.writeFileSync(resultsFile, JSON.stringify([...merged.values()], null, 2) + '\n');
  const summary = {
    requested: selected.length,
    pending_before_run: pending.length,
    resumed_from_checkpoint: selected.length - pending.length,
    read_ok: rows.length,
    results_total: merged.size,
    stopped: stopped,
    checkpoint,
    output_dir: outputDir,
  };
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return { rows, summary, profiles: [...merged.values()] };
}

cli({
  site: 'hunter-linkedin',
  name: 'profile-read-batch',
  description: '单个浏览器会话内顺序读取多个 LinkedIn 主页，逐条写检查点；中断后用同一输出目录续读',
  domain: 'www.linkedin.com',
  access: 'read',
  browser: true,
  strategy: Strategy.COOKIE,
  args: [
    { name: 'input', type: 'string', required: true, help: 'JSON 文件，字段 profile_urls[]（可选 output、resume、wait_seconds、limit）' },
    { name: 'output', type: 'string', required: false, help: '结果与检查点目录；默认 ~/.hunter/channels/linkedin/profile-batch' },
    { name: 'resume', type: 'string', required: false, help: '已有检查点文件；默认输出目录下的 checkpoint.jsonl' },
    { name: 'wait', type: 'number', required: false, help: '页面就绪硬上限秒数，默认 8；就绪后立即读取' },
    { name: 'limit', type: 'number', required: false, help: '本次最多读取人数' },
    { name: 'pacing', type: 'string', required: false, help: '读取节奏：steady（稳健，默认 25–45 秒）/ conservative（45–90 秒）/ standard（15–25 秒）/ none' },
  ],
  func: async (page, args) => {
    if (!page) fail('browser_session_required');
    const file = path.resolve(args.input);
    if (!fs.existsSync(file)) fail('input_file_missing');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    const outputDir = path.resolve(args.output ?? input.output ?? path.join(process.env.HUNTER_DATA_DIR || path.join(os.homedir(), '.hunter'), 'channels', 'linkedin', 'profile-batch'));
    // Detail reading is anchor-based: main page for basics, /details/experience/ and
    // /details/education/ for the structured lists (no main-page scrolling).
    const { getRegistry } = await import('@jackwener/opencli/registry');
    const waitSeconds = args.wait ?? input.wait_seconds ?? 8;
    const preset = String(args.pacing ?? input.pacing ?? 'steady');
    const pacer = preset === 'none' ? null : createPacer({ preset });
    const readProfile = async url => normalizeRow(
      await readProfileFromPage(page, url, waitSeconds, { getCommand: name => getRegistry().get(name) }),
      url,
    );
    const result = await runProfileBatch({
      page,
      urls: input.profile_urls,
      outputDir,
      resumeFile: args.resume ? path.resolve(args.resume) : input.resume ? path.resolve(input.resume) : undefined,
      waitSeconds,
      limit: args.limit ?? input.limit,
      readProfile,
      pacer,
    });
    return result.rows;
  },
});
