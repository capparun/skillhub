import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkOutreachAttempt, recordOutreachAttempt } from './lib/outreach-ledger.js';
import { readJsonFile } from './lib/json-file.js';

const DEFAULT_LEDGER = path.join(os.homedir(), '.hunter', 'channels', 'linkedin', 'outreach-ledger.json');
const expandHome = value => value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
const readJson = file => readJsonFile(file);

cli({
  site: 'hunter-linkedin', name: 'outreach-ledger', access: 'write',
  description: '检查或记录候选人触达，执行审批校验、幂等和防重复规则。',
  domain: 'www.linkedin.com', strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, positional: true, description: '触达意图或执行结果 JSON' },
    { name: 'action', type: 'string', default: 'check', description: '操作：check 或 record' },
    { name: 'ledger', type: 'string', default: '', description: '台账 JSON 路径；默认使用 Hunter LinkedIn 数据目录' },
    { name: 'output', type: 'string', default: '', description: 'check 结果 JSON 的可选输出路径' },
  ],
  func: async kwargs => {
    const action = String(kwargs.action || 'check').toLowerCase();
    if (!['check', 'record'].includes(action)) throw new Error('--action 必须是 check 或 record');
    const inputPath = path.resolve(expandHome(kwargs.input));
    if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);
    const ledgerPath = kwargs.ledger ? path.resolve(expandHome(kwargs.ledger)) : DEFAULT_LEDGER;
    const entries = fs.existsSync(ledgerPath) ? (readJson(ledgerPath).entries || []) : [];
    const input = readJson(inputPath);

    if (action === 'check') {
      const result = checkOutreachAttempt(entries, input);
      if (kwargs.output) {
        const outputPath = path.resolve(expandHome(kwargs.output));
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      }
      return result;
    }

    const recorded = recordOutreachAttempt(entries, input, input.safety || {});
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify({ schemaVersion: 1, entries: recorded.entries }, null, 2));
    return { recorded: true, count: recorded.entries.length, ledgerPath };
  },
});
