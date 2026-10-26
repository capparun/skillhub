#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { opencliInvocation } from './opencli-runtime.mjs';
import { parseOpencliOutput, unwrapOpencliResult } from './opencli-output.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CAPABILITIES = {
  profile: { command: 'profile-read', field: 'profile' },
  experience: { command: 'profile-experience', field: 'experiences' },
  projects: { command: 'profile-projects', field: 'projects' },
  posts: { command: 'posts', field: 'posts', extra: ['--limit', '10'] },
  services: { command: 'services-read', field: 'services' },
};

export function parseArgs(argv) {
  const options = {
    input: '', output: '', include: ['profile', 'experience'], limit: 20,
    minScore: 0, qualifiedOnly: true, delayMs: 5000, commandTimeoutMs: 120000, opencliBin: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token.startsWith('--') && !options.input) { options.input = token; continue; }
    if (token === '--all') { options.qualifiedOnly = false; continue; }
    if (!next || next.startsWith('--')) throw new Error(`缺少参数值: ${token}`);
    if (token === '--output') options.output = next;
    else if (token === '--include') options.include = next.split(',').map(value => value.trim()).filter(Boolean);
    else if (token === '--limit') options.limit = Number(next);
    else if (token === '--min-score') options.minScore = Number(next);
    else if (token === '--delay-ms') options.delayMs = Number(next);
    else if (token === '--command-timeout-ms') options.commandTimeoutMs = Number(next);
    else if (token === '--opencli-bin') options.opencliBin = next;
    else throw new Error(`未知参数: ${token}`);
    index += 1;
  }
  if (!options.input) throw new Error('用法: enrich-linkedin-profiles.mjs <评估结果.json> [options]');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50) throw new Error('--limit 必须是 1-50 的整数');
  if (!Number.isFinite(options.minScore)) throw new Error('--min-score 必须是数字');
  if (!Number.isInteger(options.delayMs) || options.delayMs < 0) throw new Error('--delay-ms 必须是非负整数');
  if (!Number.isInteger(options.commandTimeoutMs) || options.commandTimeoutMs < 1000) throw new Error('--command-timeout-ms 必须至少为 1000');
  for (const capability of options.include) {
    if (!CAPABILITIES[capability]) throw new Error(`不支持的详情能力: ${capability}`);
  }
  if (!options.include.includes('profile')) options.include.unshift('profile');
  return options;
}

function normalizeProfileUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase())) return '';
    if (!/^\/in\/[^/?#]+\/?$/.test(url.pathname)) return '';
    return `https://www.linkedin.com${url.pathname.replace(/\/?$/, '/')}`;
  } catch {
    return '';
  }
}

function candidateView(item) {
  const evaluation = item?.evaluation || {};
  const rawUrl = item?.profileUrl || (item?.profileId ? `https://www.linkedin.com/in/${encodeURIComponent(item.profileId)}/` : '');
  return {
    ref: item,
    name: item?.name || '',
    url: normalizeProfileUrl(rawUrl),
    score: item?.score ?? item?.totalScore ?? evaluation.score ?? 0,
    qualified: item?.qualified ?? evaluation.qualified ?? false,
  };
}

export function selectCandidates(input, { qualifiedOnly = true, minScore = 0, limit = 20 } = {}) {
  const items = Array.isArray(input?.candidates)
    ? input.candidates
    : Array.isArray(input?.evaluations) ? input.evaluations : [];
  return items.map(candidateView)
    .filter(candidate => candidate.url)
    .filter(candidate => !qualifiedOnly || candidate.qualified)
    .filter(candidate => candidate.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function runOpencli(args, { opencliBin = '', spawnImpl = spawn, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const invocation = opencliInvocation(opencliBin);
    const child = spawnImpl(invocation.command, [...invocation.prefix, ...args], {
      shell: invocation.shell,
      windowsHide: true,
      env: {
        ...process.env,
        OPENCLI_BROWSER_COMMAND_TIMEOUT: String(Math.max(1, Math.floor(timeoutMs / 1000))),
      },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs + 15000);
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) {
        const error = new Error(`OpenCLI 命令超时（${timeoutMs}ms）: ${args.slice(0, 2).join(' ')}`);
        error.timedOut = true;
        return reject(error);
      }
      if (code === 0) {
        try { return resolve(parseOpencliOutput(stdout)); } catch (error) { return reject(error); }
      }
      const message = `${stderr}\n${stdout}`.trim();
      const error = new Error(message || `OpenCLI 退出码 ${code}`);
      error.empty = /EMPTY_RESULT|returned no data|no visible/i.test(message);
      error.exitCode = code;
      reject(error);
    });
  });
}

function normalizePayload(capability, payload) {
  payload = unwrapOpencliResult(payload);
  if (payload == null || (Array.isArray(payload) && payload.length === 0)) {
    const error = new Error('EMPTY_RESULT: no detail data');
    error.empty = true;
    throw error;
  }
  if (typeof payload !== 'object') throw new Error('详情结果必须是对象或数组');
  const rows = Array.isArray(payload) ? payload : [payload];
  if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length === 0)) {
    throw new Error('详情结果包含无效记录');
  }
  if (capability === 'profile') {
    const profile = rows[0];
    if (!['name', 'headline', 'location', 'about', 'education', 'profile_url', 'profileUrl']
      .some(key => typeof profile[key] === 'string' && profile[key].trim())) {
      throw new Error('详情结果缺少可识别的个人档案字段');
    }
    return profile;
  }
  return rows;
}

export function buildDetailText(detail) {
  const parts = [];
  const profile = detail?.profile;
  if (profile) {
    if (profile.headline) parts.push(`[Headline]\n${profile.headline}`);
    if (profile.location) parts.push(`[Location]\n${profile.location}`);
    if (profile.about) parts.push(`[About]\n${profile.about}`);
    if (profile.education) parts.push(`[Education]\n${profile.education}`);
  }
  const collections = [
    ['Experience', detail?.experiences], ['Projects', detail?.projects],
    ['Posts', detail?.posts], ['Services', detail?.services],
  ];
  for (const [label, rows] of collections) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const text = rows.map(row => row.raw_text || row.rawText || row.body || row.overview || JSON.stringify(row)).join('\n');
    parts.push(`[${label}]\n${text}`);
  }
  return parts.join('\n\n').slice(0, 16000);
}

function atomicWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function enrichProfiles(options, dependencies = {}) {
  const inputPath = path.resolve(options.input.replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);
  const outputPath = path.resolve((options.output || inputPath.replace(/\.json$/i, '') + '-with-profiles.json').replace(/^~(?=$|[\\/])/, os.homedir()));
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const selected = selectCandidates(input, options);
  const execute = dependencies.runOpencli || ((args) => runOpencli(args, {
    opencliBin: options.opencliBin,
    timeoutMs: options.commandTimeoutMs,
  }));
  const sleep = dependencies.wait || wait;
  let completed = 0;
  let failed = 0;

  for (const candidate of selected) {
    candidate.ref.detail ||= {};
    candidate.ref.detailFetch ||= {};
    for (const capability of options.include) {
      const config = CAPABILITIES[capability];
      if (candidate.ref.detailFetch[capability]?.status === 'success') continue;
      const args = ['linkedin', config.command, '--profile-url', candidate.url, '-f', 'json', '--site-session', 'persistent'];
      if (config.extra) args.splice(4, 0, ...config.extra);
      try {
        const payload = await execute(args);
        candidate.ref.detail[config.field] = normalizePayload(capability, payload);
        candidate.ref.detailFetch[capability] = { status: 'success', fetchedAt: new Date().toISOString() };
      } catch (error) {
        const status = error.empty ? 'empty' : 'failed';
        candidate.ref.detailFetch[capability] = { status, error: String(error.message || error), fetchedAt: new Date().toISOString() };
        if (!error.empty) failed += 1;
      }
      candidate.ref.detailText = buildDetailText(candidate.ref.detail);
      atomicWriteJson(outputPath, input);
      if (options.delayMs > 0) await sleep(options.delayMs);
    }
    candidate.ref.profileViewedAt = new Date().toISOString();
    completed += 1;
    atomicWriteJson(outputPath, input);
  }
  return { outputPath, selected: selected.length, completed, failed };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await enrichProfiles(options);
  console.log(JSON.stringify({ success: result.failed === 0, ...result }, null, 2));
  if (result.failed > 0) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
