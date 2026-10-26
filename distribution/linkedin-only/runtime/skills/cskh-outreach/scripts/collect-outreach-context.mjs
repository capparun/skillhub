#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { opencliInvocation } from './opencli-runtime.mjs';
import { parseOpencliOutput, unwrapOpencliResult } from './opencli-output.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export function canonicalProfileUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase())) return '';
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
    return match ? `linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}` : '';
  } catch {
    return '';
  }
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['rows', 'items', 'data', 'results', 'connections', 'conversations', 'invitations']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return value && typeof value === 'object' ? [value] : [];
}

function rowProfileUrl(row) {
  return row?.profileUrl || row?.profile_url || row?.participantProfileUrl || row?.url || '';
}

function exactProfileRows(value, profileKey, observedAt) {
  return rowsOf(value)
    .filter(row => canonicalProfileUrl(rowProfileUrl(row)) === profileKey)
    .map(row => ({ ...row, observedAt }));
}

function normalizedName(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function canonicalThreadUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/messaging\/thread\/([^/]+)\/?$/i);
    return url.hostname === 'www.linkedin.com' && match ? `linkedin.com/messaging/thread/${match[1]}` : '';
  } catch {
    return '';
  }
}

function parseThreadSnapshot(value, expectedName, expectedThreadUrl) {
  const row = rowsOf(value)[0];
  if (!row || normalizedName(row.recipient) !== normalizedName(expectedName)
    || canonicalThreadUrl(row.threadUrl) !== canonicalThreadUrl(expectedThreadUrl)) return null;
  let snapshot;
  try { snapshot = JSON.parse(row.snapshotJson); } catch { return null; }
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  const latest = messages.at(-1) || null;
  return {
    threadUrl: row.threadUrl,
    recipient: row.recipient,
    profileUrl: row.profileUrl || null,
    messageCount: messages.length,
    latestMessage: latest,
  };
}

function parseCapabilitySnapshot(value, profileKey) {
  const row = rowsOf(value)[0];
  if (!row || row.advisoryOnly !== true || row.executionAllowed !== false) return null;
  let snapshot;
  try { snapshot = JSON.parse(row.snapshotJson); } catch { return null; }
  if (snapshot?.candidate?.profileKey !== profileKey || snapshot.advisoryOnly !== true || snapshot.executionAllowed !== false) return null;
  return snapshot;
}

function assertCandidateApproval(input) {
  const profileKey = canonicalProfileUrl(input?.candidate?.profileUrl);
  const approval = input?.candidateApproval || {};
  const approvalKey = canonicalProfileUrl(approval.profileUrl);
  if (!profileKey || approval.approved !== true || approval.source !== 'current_conversation'
    || !Number.isFinite(Date.parse(approval.approvedAt || '')) || approvalKey !== profileKey) {
    throw new Error('候选人审批无效、过期或与目标主页不一致');
  }
  if (!String(input.purpose || '').trim()) throw new Error('缺少触达目的');
  return profileKey;
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

export async function collectOutreachContext(input, options = {}) {
  const profileKey = assertCandidateApproval(input);
  const outputDir = path.resolve(options.outputDir || process.cwd());
  const run = options.runner || defaultRunner;
  const runner = async (...args) => unwrapOpencliResult(await run(...args));
  const observedAt = new Date().toISOString();
  const readWarnings = [];

  await fs.mkdir(outputDir, { recursive: true });

  const read = async (source, args) => {
    try {
      return await runner(args);
    } catch (error) {
      readWarnings.push({ source, error: error.message, observedAt });
      return [];
    }
  };
  const connectionsRaw = await read('connections', ['linkedin', 'connections', '--limit', '500', '-f', 'json']);
  const invitationsRaw = await read('sent-invitations', ['linkedin', 'sent-invitations', '-f', 'json']);
  const inboxRaw = await read('inbox', ['linkedin', 'inbox', '--limit', '100', '-f', 'json']);
  const profileRaw = await read('profile-read', ['linkedin', 'profile-read', '--profile-url', input.candidate.profileUrl, '-f', 'json']);
  const capabilityRaw = await read('capability-probe', [
    'hunter-linkedin', 'capability-probe', input.candidate.profileUrl,
    '--expectedName', input.candidate.name, '-f', 'json',
  ]);
  const capabilitySnapshot = parseCapabilitySnapshot(capabilityRaw, profileKey);
  if (!capabilitySnapshot && !readWarnings.some(warning => warning.source === 'capability-probe')) {
    readWarnings.push({ source: 'capability-probe', error: '能力探测输出未通过候选人绑定或只读边界校验', observedAt });
  }

  const candidateName = normalizedName(input.candidate.name);
  const unverifiedConversationCandidates = rowsOf(inboxRaw)
    .filter(row => normalizedName(row.person_name || row.personName || row.recipient) === candidateName)
    .map(row => ({ ...row, observedAt, verification: 'name_only_not_relationship_evidence' }));

  let threadSnapshot = null;
  if (unverifiedConversationCandidates.length === 1) {
    const candidateThreadUrl = unverifiedConversationCandidates[0].thread_url
      || unverifiedConversationCandidates[0].threadUrl;
    if (canonicalThreadUrl(candidateThreadUrl)) {
      const snapshotRaw = await read('thread-snapshot', [
        'hunter-linkedin', 'thread-snapshot', candidateThreadUrl,
        '--expectedName', input.candidate.name, '--maxScrolls', '30', '-f', 'json',
      ]);
      threadSnapshot = parseThreadSnapshot(snapshotRaw, input.candidate.name, candidateThreadUrl);
      if (!threadSnapshot && !readWarnings.some(warning => warning.source === 'thread-snapshot')) {
        readWarnings.push({ source: 'thread-snapshot', error: '快照输出未通过线程与收件人绑定校验', observedAt });
      }
    }
  }

  const latestSpeaker = normalizedName(threadSnapshot?.latestMessage?.speaker);
  const conversationStatus = !threadSnapshot
    ? 'no_verified_thread'
    : (latestSpeaker === candidateName ? 'candidate_replied' : 'awaiting_candidate_reply');

  const profileRows = rowsOf(profileRaw);
  const profileRow = profileRows.find(row => canonicalProfileUrl(rowProfileUrl(row)) === profileKey) || profileRows[0] || {};
  const evidence = {
    schemaVersion: 1,
    candidate: input.candidate,
    relationshipHint: input.relationshipHint || null,
    connections: exactProfileRows(connectionsRaw, profileKey, observedAt),
    sentInvitations: exactProfileRows(invitationsRaw, profileKey, observedAt),
    conversations: [],
    unverifiedConversationCandidates,
    threadSnapshot,
    readWarnings,
    profile: {
      observedAt,
      profileUrl: input.candidate.profileUrl,
      returnedProfileUrl: rowProfileUrl(profileRow) || null,
      shapeSupported: Boolean(capabilitySnapshot),
      actions: capabilitySnapshot ? [
        ...(capabilitySnapshot.candidate.connectEntry === 'profile_button' || capabilitySnapshot.candidate.connectEntry === 'more_menu' ? ['Connect'] : []),
        ...(capabilitySnapshot.candidate.messageEntry === 'profile_button' ? ['Message'] : []),
      ] : [],
      canConnect: capabilitySnapshot ? ['profile_button', 'more_menu'].includes(capabilitySnapshot.candidate.connectEntry) : null,
      invitationPending: capabilitySnapshot?.candidate?.invitationPending === true,
      note: capabilitySnapshot ? '动作来自只读 capability-probe 可见 UI 证据' : '能力探测不可用；不得推断可 Connect 或可 Message',
    },
  };

  const evidencePath = path.join(outputDir, 'relationship-evidence.json');
  const relationshipPath = path.join(outputDir, 'relationship-state.json');
  const planInputPath = path.join(outputDir, 'outreach-plan-input.json');
  const planPath = path.join(outputDir, 'outreach-plan.json');
  const ledgerInputPath = path.join(outputDir, 'outreach-ledger-intent.json');
  const ledgerCheckPath = path.join(outputDir, 'outreach-ledger-check.json');
  await writeJson(evidencePath, evidence);

  await runner(['hunter-linkedin', 'relationship-state', evidencePath, '--output', relationshipPath, '-f', 'json']);
  const relationshipState = JSON.parse(await fs.readFile(relationshipPath, 'utf8'));

  await writeJson(planInputPath, {
    candidate: input.candidate,
    candidateApproval: input.candidateApproval,
    relationshipState,
    verifiedEmail: input.verifiedEmail || '',
  });
  await runner(['hunter-linkedin', 'outreach-plan', planInputPath, '--output', planPath, '-f', 'json']);
  const outreachPlan = JSON.parse(await fs.readFile(planPath, 'utf8'));

  let ledgerCheck = { allowed: false, reason: 'channel_not_actionable' };
  if (!['pause', 'wait'].includes(outreachPlan.primaryChannel)) {
    await writeJson(ledgerInputPath, {
      candidate: input.candidate,
      channel: outreachPlan.primaryChannel,
      purpose: input.purpose,
    });
    const ledgerArgs = ['hunter-linkedin', 'outreach-ledger', ledgerInputPath, '--action', 'check'];
    if (input.ledgerPath) ledgerArgs.push('--ledger', path.resolve(input.ledgerPath));
    ledgerArgs.push('--output', ledgerCheckPath, '-f', 'json');
    await runner(ledgerArgs);
    ledgerCheck = JSON.parse(await fs.readFile(ledgerCheckPath, 'utf8'));
  }

  const result = {
    schemaVersion: 1,
    mode: 'read_only_preparation',
    candidate: input.candidate,
    evidencePath,
    relationshipPath,
    planPath,
    ledgerCheckPath: ledgerCheck.reason === 'channel_not_actionable' ? null : ledgerCheckPath,
    relationshipState,
    outreachPlan,
    ledgerCheck,
    threadSnapshot,
    capabilitySnapshot,
    conversationStatus,
    readWarnings,
    readyForContentReview: ledgerCheck.allowed === true
      && readWarnings.length === 0
      && conversationStatus !== 'awaiting_candidate_reply',
    executionAllowed: false,
    nextAction: readWarnings.length > 0
      ? 'review_read_warnings'
      : (conversationStatus === 'awaiting_candidate_reply'
        ? 'wait_for_candidate_reply'
        : (ledgerCheck.allowed === true ? 'generate_and_review_content' : 'stop_and_review_reason')),
  };
  await writeJson(path.join(outputDir, 'outreach-context.json'), result);
  return result;
}

function parseArgs(argv) {
  const args = { input: '', outputDir: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!args.input && !value.startsWith('--')) args.input = value;
    else if (value === '--output-dir') args.outputDir = argv[++index] || '';
    else throw new Error(`未知参数: ${value}`);
  }
  if (!args.input) throw new Error('用法: collect-outreach-context.mjs <input.json> --output-dir <目录>');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const result = await collectOutreachContext(input, {
    outputDir: args.outputDir ? path.resolve(args.outputDir) : path.dirname(inputPath),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
