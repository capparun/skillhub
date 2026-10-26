#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashContent(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function text(value) {
  return String(value ?? '').trim();
}

function validate(input) {
  const candidate = input.candidate || {};
  const email = input.email || {};
  const draft = input.draft || {};
  const personalization = input.personalization || {};
  if (!text(candidate.name) || !text(candidate.profileUrl)) throw new Error('缺少候选人姓名或精确主页');
  if (!EMAIL_RE.test(text(email.address))) throw new Error('缺少合法的候选人邮箱');
  if (email.verificationStatus !== 'verified') throw new Error('邮箱必须明确标记为 verified');
  if (!text(email.source) || !text(email.verificationMethod)) throw new Error('邮箱缺少可审阅的来源或验证方式');
  if (!Number.isFinite(Date.parse(email.verifiedAt || ''))) throw new Error('邮箱缺少有效验证时间');
  if (!text(draft.subject) || !text(draft.body)) throw new Error('邮件主题和正文不能为空');
  if (!text(personalization.jdFact)) throw new Error('缺少邮件使用的 JD/JBF 事实');
  if (!Array.isArray(personalization.candidateFacts) || personalization.candidateFacts.filter(text).length === 0) {
    throw new Error('缺少邮件使用的候选人可核验证据');
  }
}

export async function createEmailDraft(input, options = {}) {
  validate(input);
  const outputDir = path.resolve(options.outputDir || process.cwd());
  const subject = text(input.draft.subject);
  const body = text(input.draft.body);
  const content = `${subject}\n${body}`;
  const result = {
    schemaVersion: 1,
    status: 'draft_ready',
    channel: 'email',
    externalActionCreated: false,
    createdAt: new Date().toISOString(),
    candidate: {
      name: text(input.candidate.name),
      profileUrl: text(input.candidate.profileUrl),
    },
    recipient: {
      address: text(input.email.address),
      source: text(input.email.source),
      verificationMethod: text(input.email.verificationMethod),
      verifiedAt: input.email.verifiedAt,
    },
    draft: { subject, body },
    personalization: {
      jdFact: text(input.personalization.jdFact),
      candidateFacts: input.personalization.candidateFacts.map(text).filter(Boolean),
    },
    contentHash: hashContent(content),
  };
  if (input.contentHash && input.contentHash !== result.contentHash) throw new Error('contentHash 与主题和正文不一致');

  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'email-draft.json');
  const markdownPath = path.join(outputDir, 'email-draft.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, [
    '# 候选人邮件草稿', '',
    `- 状态：${result.status}`,
    `- 候选人：${result.candidate.name}`,
    `- 收件人：${result.recipient.address}`,
    `- 邮箱来源：${result.recipient.source}`,
    `- 内容哈希：${result.contentHash}`,
    '', `## ${subject}`, '', body, '',
    '> 仅生成草稿，未连接邮箱账号，未产生任何外部发送动作。', '',
  ].join('\n'), 'utf8');
  return { ...result, jsonPath, markdownPath };
}

async function main() {
  const [inputFile, flag, outputDir] = process.argv.slice(2);
  if (!inputFile || flag !== '--output-dir' || !outputDir) throw new Error('用法: create-email-draft.mjs <input.json> --output-dir <目录>');
  const input = JSON.parse(await fs.readFile(path.resolve(inputFile), 'utf8'));
  process.stdout.write(`${JSON.stringify(await createEmailDraft(input, { outputDir }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
