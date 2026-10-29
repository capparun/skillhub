import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

export async function runProfileBatch({ page, urls, outputDir, resumeFile, waitSeconds = 5, limit } = {}) {
  if (!page) fail('browser_session_required');
  if (!Array.isArray(urls) || !urls.length) fail('profile_urls_required');
  const selected = [...new Set(urls.map(normalizeProfileUrl))].slice(0, Number.isInteger(limit) ? limit : undefined);
  fs.mkdirSync(outputDir, { recursive: true });
  const checkpoint = resumeFile ?? path.join(outputDir, 'checkpoint.jsonl');
  const done = readCheckpoint(checkpoint);
  const pending = selected.filter(url => !done.has(url));
  const rows = [];
  let stopped = null;
  for (const url of pending) {
    const started = Date.now();
    try {
      await page.goto(url);
      await page.wait(waitSeconds);
      const state = await page.evaluate('({url: location.href, title: document.title})');
      const fatal = fatalCode(state);
      if (fatal) {
        stopped = fatal;
        fs.appendFileSync(checkpoint, JSON.stringify({ profile_url: url, status: 'stopped', error: fatal, duration_ms: Date.now() - started }) + '\n');
        break;
      }
      await page.autoScroll({ times: 4, delayMs: 700 });
      await page.wait(1);
      const row = normalizeRow(await page.evaluate(buildProfileExtractionScript()), url);
      rows.push(row);
      fs.appendFileSync(checkpoint, JSON.stringify({ profile_url: url, status: 'ok', duration_ms: Date.now() - started }) + '\n');
    } catch (error) {
      const code = error?.code ?? 'profile_read_failed';
      fs.appendFileSync(checkpoint, JSON.stringify({ profile_url: url, status: 'failed', error: code, duration_ms: Date.now() - started }) + '\n');
      if (['not_logged_in', 'verification_required'].includes(code)) { stopped = code; break; }
    }
  }
  const summary = {
    requested: selected.length,
    pending_before_run: pending.length,
    resumed_from_checkpoint: selected.length - pending.length,
    read_ok: rows.length,
    stopped: stopped,
    checkpoint,
    output_dir: outputDir,
  };
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDir, 'profiles.json'), JSON.stringify(rows, null, 2) + '\n');
  return { rows, summary };
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
    { name: 'wait', type: 'number', required: false, help: '每次导航后的等待秒数，默认 5' },
    { name: 'limit', type: 'number', required: false, help: '本次最多读取人数' },
  ],
  func: async (page, args) => {
    if (!page) fail('browser_session_required');
    const file = path.resolve(args.input);
    if (!fs.existsSync(file)) fail('input_file_missing');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    const outputDir = path.resolve(args.output ?? input.output ?? path.join(process.env.HUNTER_DATA_DIR || path.join(os.homedir(), '.hunter'), 'channels', 'linkedin', 'profile-batch'));
    const result = await runProfileBatch({
      page,
      urls: input.profile_urls,
      outputDir,
      resumeFile: args.resume ? path.resolve(args.resume) : input.resume ? path.resolve(input.resume) : undefined,
      waitSeconds: args.wait ?? input.wait_seconds ?? 5,
      limit: args.limit ?? input.limit,
    });
    return result.rows;
  },
});
