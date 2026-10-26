import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildOutreachPlan } from './lib/outreach-plan.js';
import { readJsonFile } from './lib/json-file.js';

const DEFAULT_OUTPUT = path.join(os.homedir(), '.hunter', 'channels', 'linkedin', 'outreach-plan.json');
const expandHome = value => value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;

cli({
  site: 'hunter-linkedin', name: 'outreach-plan', access: 'read',
  description: '根据候选人关系状态生成确定性渠道计划；不生成话术，不执行发送。',
  domain: 'www.linkedin.com', strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, positional: true, description: '候选人、关系状态与已验证联系方式 JSON' },
    { name: 'output', type: 'string', default: '', description: '输出渠道计划 JSON 路径' },
  ],
  func: async kwargs => {
    const inputPath = path.resolve(expandHome(kwargs.input));
    if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);
    const plan = buildOutreachPlan(readJsonFile(inputPath));
    const outputPath = kwargs.output ? path.resolve(expandHome(kwargs.output)) : DEFAULT_OUTPUT;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ schemaVersion: 1, source: 'hunter-linkedin/outreach-plan', ...plan }, null, 2));
    return { primaryChannel: plan.primaryChannel, executionAllowed: false, outputPath };
  },
});
