#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { opencliInvocation } from './opencli-runtime.mjs';
import { parseOpencliOutput, unwrapOpencliResult } from './opencli-output.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROVIDERS = ['google', 'brave', 'yahoo'];
const GOOGLE_TIMEOUT_MS = 45000;
const ASSIST_MAX_RETRIES = 3;
const ASSIST_WAIT_MS = 30000;

export function parseArgs(argv) {
  const options = { keyword: '', title: '', location: '', company: '', exclude: '', limit: 10, output: '', normalizedOutput: '', opencliBin: '', skipGoogle: false, humanAssist: true, plan: '', channel: 'linkedin' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--skip-google') { options.skipGoogle = true; continue; }
    if (token === '--no-human-assist') { options.humanAssist = false; continue; }
    const next = argv[index + 1];
    if (!token.startsWith('--')) throw new Error(`未知参数: ${token}`);
    if (!next || next.startsWith('--')) throw new Error(`缺少参数值: ${token}`);
    if (token === '--keyword') options.keyword = next;
    else if (token === '--title') options.title = next;
    else if (token === '--location') options.location = next;
    else if (token === '--company') options.company = next;
    else if (token === '--exclude') options.exclude = next;
    else if (token === '--limit') options.limit = Number(next);
    else if (token === '--output') options.output = next;
    else if (token === '--normalized-output') options.normalizedOutput = next;
    else if (token === '--opencli-bin') options.opencliBin = next;
    else if (token === '--plan') options.plan = next;
    else if (token === '--channel') options.channel = next;
    else throw new Error(`未知参数: ${token}`);
    index += 1;
  }
  if (!options.keyword && !options.plan) throw new Error('--keyword 与 --plan 至少提供一个');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error('--limit 必须是 1-100 的整数');
  return options;
}

export function buildQuery({ keyword, title, location, company, exclude, search }) {
  if (search && typeof search === 'object') {
    const quote = value => String(value).replaceAll('"', '\\"');
    const parts = ['site:linkedin.com/in'];
    const keywords = Array.isArray(search.keywords) ? search.keywords.filter(Boolean) : [];
    if (keywords.length) parts.push(keywords.map(k => '"' + quote(k) + '"').join(' OR '));
    if (search.title) parts.push('intitle:"' + quote(search.title) + '"');
    if (search.location) parts.push('"' + quote(search.location) + '"');
    const companies = [...(search.currentCompany ?? []), ...(search.pastCompany ?? [])].filter(Boolean);
    if (companies.length) parts.push(companies.map(c => '"' + quote(c) + '"').join(' OR '));
    for (const word of String(search.exclude ?? '').split(',').map(v => v.trim()).filter(Boolean)) parts.push('-"' + quote(word) + '"');
    return parts.join(' ');
  }
  const quote = value => `"${String(value).replaceAll('"', '\\"')}"`;
  const parts = ['site:linkedin.com/in', quote(keyword)];
  if (title) parts.push(`intitle:${quote(title)}`);
  if (location) parts.push(quote(location));
  if (company) parts.push(quote(company));
  for (const word of String(exclude || '').split(',').map(value => value.trim()).filter(Boolean)) parts.push(`-${quote(word)}`);
  return parts.join(' ');
}

export function runOpencli(args, { opencliBin = '', spawnImpl = spawn, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const invocation = opencliInvocation(opencliBin);
    const child = spawnImpl(invocation.command, [...invocation.prefix, ...args], {
      shell: invocation.shell,
      windowsHide: true,
      env: { ...process.env, OPENCLI_BROWSER_COMMAND_TIMEOUT: String(Math.floor(timeoutMs / 1000)) },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs + 15000);
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        try { return resolve(parseOpencliOutput(stdout)); } catch (error) { return reject(error); }
      }
      reject(new Error(`${stderr}\n${stdout}`.trim() || `OpenCLI 退出码 ${code}`));
    });
  });
}

export function normalizeSearchRows(rows, limit = 10) {
  rows = unwrapOpencliResult(rows);
  if (!Array.isArray(rows)) throw new Error('搜索结果必须是数组');
  const seen = new Set();
  const results = [];
  for (const row of rows) {
    let parsed;
    try { parsed = new URL(row?.url || ''); } catch { continue; }
    const match = parsed.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname) || !match) continue;
    const profileId = decodeURIComponent(match[1]).replace(/\/(?:[a-z]{2})$/i, '');
    if (!profileId || seen.has(profileId)) continue;
    seen.add(profileId);
    results.push({
      profileId,
      profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(profileId)}`,
      snippetTitle: row.title || '',
      snippet: row.snippet || '',
    });
    if (results.length >= limit) break;
  }
  return results;
}

function resolvePath(value, fallback) {
  const selected = value || fallback;
  return path.resolve(selected.replace(/^~(?=$|[\\/])/, os.homedir()));
}

function loadPlanSearch(options) {
  if (!options.plan) return null;
  const raw = JSON.parse(fs.readFileSync(resolvePath(options.plan, options.plan), 'utf8'));
  const plan = raw?.channelPlans?.[options.channel]?.search ?? raw?.search;
  if (!plan) throw new Error('方案文件中找不到 channelPlans.' + options.channel + '.search');
  return plan;
}

export async function discover(options, dependencies = {}) {
  const planSearch = dependencies.planSearch !== undefined ? dependencies.planSearch : loadPlanSearch(options);
  const sleep = dependencies.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const log = dependencies.log || ((message) => console.error(message));
  const run = dependencies.runOpencli || ((args, execOptions = {}) => runOpencli(args, { opencliBin: options.opencliBin, timeoutMs: execOptions.timeoutMs }));
  const execute = async (...args) => unwrapOpencliResult(await run(...args));
  const query = buildQuery({ ...options, search: planSearch ?? undefined });
  const attempts = [];
  let provider = null;
  let results = [];
  let googleSuspectedBlocked = false;
  let humanAssist = null;

  const providers = options.skipGoogle ? PROVIDERS.filter(name => name !== 'google') : PROVIDERS.slice();
  if (options.skipGoogle) attempts.push({ provider: 'google', status: 'skipped', reason: 'skip-google' });

  for (const candidate of providers) {
    const isGoogle = candidate === 'google';
    const providerLimit = candidate === 'brave' ? Math.min(options.limit, 18) : candidate === 'yahoo' ? Math.min(options.limit, 7) : options.limit;
    const args = [candidate, 'search', query, '--limit', String(providerLimit), '-f', 'json', '--site-session', 'persistent'];
    const execOptions = isGoogle ? { timeoutMs: GOOGLE_TIMEOUT_MS } : {};

    let rows = null;
    let attemptError = null;
    try {
      rows = await execute(args, execOptions);
    } catch (error) {
      attemptError = error;
    }

    if (rows !== null) {
      results = normalizeSearchRows(rows, options.limit);
      const attempt = { provider: candidate, status: results.length ? 'success' : 'empty', count: results.length };
      if (!results.length && isGoogle && options.humanAssist) attempt.humanAssist = 'prompted';
      attempts.push(attempt);
    } else {
      const message = String(attemptError?.message || attemptError);
      attempts.push({ provider: candidate, status: 'error', error: message });
      if (/BROWSER_CONNECT|extension not connected/i.test(message)) break;
    }

    if (results.length) { provider = candidate; break; }

    if (isGoogle && options.humanAssist) {
      const assist = await runHumanAssistWindow({ execute, args, sleep, log, limit: options.limit });
      attempts.push(...assist.attempts);
      humanAssist = assist.outcome;
      if (assist.fatal) break;
      if (assist.results.length) {
        results = assist.results;
        provider = candidate;
        break;
      }
      googleSuspectedBlocked = true;
    }
  }

  const dataRoot = process.env.HUNTER_DATA_DIR || path.join(os.homedir(), '.hunter');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = resolvePath(options.output, path.join(dataRoot, 'channels', 'linkedin', `xray-result-${stamp}.json`));
  const payload = { query, searchProvider: provider, searchAttempts: attempts, googleSuspectedBlocked, source: 'linkedin-xray', collectedAt: new Date().toISOString(), results, filteredOut: [] };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (!provider) return { success: false, query, attempts, googleSuspectedBlocked, humanAssist, outputPath, count: 0 };

  const normalizedOutput = resolvePath(options.normalizedOutput, path.join(dataRoot, 'channels', 'linkedin', 'normalized-xray-result.json'));
  const normalized = await execute(['hunter-linkedin', 'normalize', '--source', 'xray', '--input', outputPath, '--output', normalizedOutput, '-f', 'json']);
  return { success: true, query, provider, attempts, googleSuspectedBlocked, humanAssist, count: results.length, outputPath, normalizedOutput, normalized };
}

async function runHumanAssistWindow({ execute, args, sleep, log, limit }) {
  const attempts = [];
  log('[xray] Google 未返回有效结果，疑似人机验证。请在 Chrome 中完成验证；脚本每 30 秒自动重试，最多 3 次。');
  for (let retry = 1; retry <= ASSIST_MAX_RETRIES; retry += 1) {
    await sleep(ASSIST_WAIT_MS);
    try {
      const rows = await execute(args, { timeoutMs: GOOGLE_TIMEOUT_MS });
      const results = normalizeSearchRows(rows, limit);
      attempts.push({ provider: 'google', status: results.length ? 'success' : 'empty', count: results.length, humanAssist: `retry-${retry}` });
      if (results.length) {
        log('[xray] 人机验证已通过，继续使用 Google。');
        return { results, attempts, outcome: 'resolved' };
      }
    } catch (error) {
      const message = String(error?.message || error);
      attempts.push({ provider: 'google', status: 'error', error: message, humanAssist: `retry-${retry}` });
      if (/BROWSER_CONNECT|extension not connected/i.test(message)) {
        return { results: [], attempts, outcome: 'aborted', fatal: message };
      }
    }
  }
  log('[xray] 等待超时，判定 Google 被人机验证拦截；本轮降级 Brave / Yahoo，同任务后续关键词组请使用 --skip-google。');
  return { results: [], attempts, outcome: 'timeout' };
}

async function main() {
  const result = await discover(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
}


