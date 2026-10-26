#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { opencliInvocation } from './opencli-runtime.mjs';
import { parseOpencliOutput, unwrapOpencliResult } from './opencli-output.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

function canonicalProfileUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase())) return '';
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
    return match ? `linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}` : '';
  } catch { return ''; }
}

function contentHash(value) {
  return `sha256:${createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')}`;
}

async function defaultRunner(args) {
  const invocation = opencliInvocation();
  const { stdout } = await execFileAsync(invocation.command, [...invocation.prefix, ...args], { maxBuffer: 16 * 1024 * 1024, shell: invocation.shell });
  return parseOpencliOutput(stdout);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const APPROVAL_MAX_AGE_MS = 15 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

function assertFreshTime(value, label, now) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) throw new Error(`${label}时间无效`);
  if (timestamp > now + CLOCK_SKEW_MS) throw new Error(`${label}时间位于未来`);
  if (now - timestamp > APPROVAL_MAX_AGE_MS) throw new Error(`${label}已过期，必须在当前对话重新确认`);
}

function validateApproval(input, now = Date.now()) {
  const approval = input.executionApproval || {};
  if (approval.approved !== true || approval.source !== 'current_conversation') throw new Error('缺少当前对话中的有效执行审批');
  assertFreshTime(approval.approvedAt, '执行审批', now);
  if (canonicalProfileUrl(approval.profileUrl) !== canonicalProfileUrl(input.candidate?.profileUrl)) throw new Error('审批候选人与执行目标不一致');
  const computedHash = contentHash(input.content);
  if (input.contentHash !== computedHash) throw new Error('contentHash 与完整待执行内容不一致');
  if (approval.channel !== input.channel || approval.contentHash !== computedHash || approval.content !== input.content) {
    throw new Error('审批渠道、内容或 contentHash 与待执行内容不一致');
  }
  if (input.execute !== true) throw new Error('execute 必须明确为 true 才能进入真实执行编排');

  const expectedChannel = input.route === 'connect' ? 'linkedin_connect'
    : (['first_message', 'existing_thread'].includes(input.route) ? 'linkedin_message' : '');
  if (!expectedChannel || input.channel !== expectedChannel) throw new Error('route 与 channel 不一致或不受支持');

  if (input.route === 'connect') {
    const preparation = input.connectPreparation || {};
    if (preparation.ready !== true || preparation.source !== 'current_conversation'
      || canonicalProfileUrl(preparation.profileUrl) !== canonicalProfileUrl(input.candidate?.profileUrl)) {
      throw new Error('Connect 缺少当前对话中针对该候选人的有效准备确认');
    }
    assertFreshTime(preparation.confirmedAt, 'Connect 准备确认', now);
  }

  if (input.route === 'existing_thread') {
    if (!input.threadUrl) throw new Error('已有会话路由缺少 threadUrl');
    if (input.conversationStatus !== 'candidate_replied') {
      throw new Error('已有会话只有在候选人已回复时才允许继续发送');
    }
    if (!input.threadSnapshot?.latestMessageHash && !input.threadSnapshot?.latestMessageText) {
      throw new Error('已有会话缺少发送前最新消息证据');
    }
  }
}

function safeCommand(input, send, approvalPath) {
  const value = String(send);
  if (input.route === 'first_message') {
    return ['hunter-linkedin', 'first-message-safe', input.candidate.profileUrl,
      '--expectedName', input.candidate.name, '--message', input.content,
      '--send', value, '--approval', send ? approvalPath : '', '-f', 'json'];
  }
  if (input.route === 'connect') {
    return ['hunter-linkedin', 'connect-safe', input.candidate.profileUrl,
      '--expectedName', input.candidate.name, '--note', input.content,
      '--send', value, '--approval', send ? approvalPath : '', '-f', 'json'];
  }
  if (input.route === 'existing_thread' && input.threadUrl) {
    const args = ['linkedin', 'safe-send', '--thread-url', input.threadUrl,
      '--expected-name', input.candidate.name, '--message', input.content,
      '--send', value];
    if (input.threadSnapshot?.latestMessageHash) args.push('--expected-last-hash', input.threadSnapshot.latestMessageHash);
    else if (input.threadSnapshot?.latestMessageText) args.push('--expected-last-text', input.threadSnapshot.latestMessageText);
    args.push('-f', 'json');
    return args;
  }
  throw new Error('不支持的 route 或缺少 threadUrl');
}

function firstRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

function capabilityCommand(input) {
  return ['hunter-linkedin', 'capability-probe', input.candidate.profileUrl,
    '--expectedName', input.candidate.name, '-f', 'json'];
}

function validateCurrentCapability(value, input) {
  const row = firstRow(value);
  let snapshot;
  try { snapshot = JSON.parse(row?.snapshotJson || ''); } catch { throw new Error('执行前能力探测未返回有效快照'); }
  if (row?.advisoryOnly !== true || row?.executionAllowed !== false
    || snapshot?.advisoryOnly !== true || snapshot?.executionAllowed !== false
    || snapshot?.candidate?.profileKey !== canonicalProfileUrl(input.candidate.profileUrl)) {
    throw new Error('执行前能力探测未通过候选人绑定或只读边界校验');
  }
  if (snapshot.session?.authenticated !== true) throw new Error('执行前 LinkedIn 会话未认证');
  const observedAt = Date.parse(snapshot.observedAt || '');
  if (!Number.isFinite(observedAt) || observedAt > Date.now() + CLOCK_SKEW_MS || Date.now() - observedAt > 5 * 60 * 1000) {
    throw new Error('执行前能力探测结果无效或已过期');
  }
  if (input.route === 'connect' && snapshot.candidate.invitationPending === true) throw new Error('执行前邀请已进入 Pending，禁止重复 Connect');
  if (input.route === 'connect' && !['profile_button', 'more_menu'].includes(snapshot.candidate.connectEntry)) {
    throw new Error(`执行前页面不再提供 Connect: ${snapshot.candidate.connectEntry || 'unknown'}`);
  }
  if (input.route === 'first_message' && snapshot.candidate.messageEntry !== 'profile_button') {
    throw new Error(`执行前页面不再提供 Message: ${snapshot.candidate.messageEntry || 'unknown'}`);
  }
  if (input.route === 'existing_thread' && snapshot.session?.inboxAvailable !== true) {
    throw new Error('执行前消息入口不可用');
  }
  return snapshot;
}

export async function executeApprovedOutreach(input, options = {}) {
  validateApproval(input, options.now ?? Date.now());
  const outputDir = path.resolve(options.outputDir || process.cwd());
  const run = options.runner || defaultRunner;
  const runner = async (...args) => unwrapOpencliResult(await run(...args));
  const ledgerPath = input.ledgerPath ? path.resolve(input.ledgerPath) : '';
  const intent = { candidate: input.candidate, channel: input.channel, purpose: input.purpose };
  const intentPath = path.join(outputDir, 'execution-intent.json');
  const approvalPath = path.join(outputDir, 'execution-approval.json');
  await writeJson(intentPath, intent);
  await writeJson(approvalPath, input.executionApproval);

  const checkArgs = ['hunter-linkedin', 'outreach-ledger', intentPath, '--action', 'check'];
  if (ledgerPath) checkArgs.push('--ledger', ledgerPath);
  checkArgs.push('-f', 'json');
  const check = await runner(checkArgs);
  if (check?.allowed !== true) return { status: 'blocked', reason: check?.reason || 'ledger_check_failed', recorded: false };

  const capabilitySnapshot = validateCurrentCapability(await runner(capabilityCommand(input)), input);

  const preflight = firstRow(await runner(safeCommand(input, false, approvalPath)));
  if (!preflight || !['draft_ready', 'dry_run_ready', 'verified', 'verified_dry_run', 'ready'].includes(preflight.status)) {
    throw new Error(`真实执行前预检失败: ${preflight?.status || 'unknown'}`);
  }

  let execution;
  try {
    execution = firstRow(await runner(safeCommand(input, true, approvalPath)));
  } catch (error) {
    execution = { status: 'uncertain', error: error.message };
  }
  const status = ['success', 'sent'].includes(execution?.status) || execution?.sent === true ? 'success'
    : (execution?.status === 'explicit_failure' ? 'explicit_failure' : 'uncertain');
  const result = {
    status,
    occurredAt: new Date().toISOString(),
    externalActionCreated: status === 'success' ? true : (status === 'explicit_failure' ? false : null),
    platformEvidence: execution || null,
    capabilityObservedAt: capabilitySnapshot.observedAt || null,
  };
  const recordEvent = {
    ...intent,
    contentHash: input.contentHash,
    approval: input.executionApproval,
    result,
    safety: input.safety || {},
    capabilitySnapshot,
  };
  const recordPath = path.join(outputDir, 'execution-record.json');
  await writeJson(recordPath, recordEvent);
  const recordArgs = ['hunter-linkedin', 'outreach-ledger', recordPath, '--action', 'record'];
  if (ledgerPath) recordArgs.push('--ledger', ledgerPath);
  recordArgs.push('-f', 'json');
  const recorded = await runner(recordArgs);
  return { ...result, recorded: recorded?.recorded === true, recordPath };
}

async function main() {
  const [inputFile, flag, outputDir] = process.argv.slice(2);
  if (!inputFile || flag !== '--output-dir' || !outputDir) throw new Error('用法: execute-approved-outreach.mjs <input.json> --output-dir <目录>');
  const input = JSON.parse(await fs.readFile(path.resolve(inputFile), 'utf8'));
  process.stdout.write(`${JSON.stringify(await executeApprovedOutreach(input, { outputDir }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
