import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  normalizeLinkedInScoutResult,
  normalizeLinkedInXrayResult,
} from './lib/index.js';
import { readJsonFile } from './lib/json-file.js';

const LINKEDIN_DIR = path.join(os.homedir(), '.hunter', 'channels', 'linkedin');

function expandHome(filePath) {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

export function detectSource(input, filePath = '') {
  const declared = input?.meta?.source || input?.source || '';
  if (/xray/i.test(declared) || /xray/i.test(filePath) || Array.isArray(input?.results)) return 'xray';
  if (/scout/i.test(declared) || /scout/i.test(filePath) || Array.isArray(input?.candidates)) return 'scout';
  throw new Error('无法识别结果来源，请通过 --source 指定 xray 或 scout');
}

export function findLatestSourceFile(source, directory = LINKEDIN_DIR) {
  const prefixes = {
    xray: 'xray-result-',
    scout: 'linkedin-scout-result',
  };
  const prefix = prefixes[source];
  if (!prefix) throw new Error(`不支持的来源: ${source}`);
  if (!fs.existsSync(directory)) throw new Error(`LinkedIn 数据目录不存在: ${directory}`);

  const matches = fs.readdirSync(directory)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => ({ name, mtime: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (matches.length === 0) throw new Error(`未找到 ${source} 结果文件: ${directory}`);
  return path.join(directory, matches[0].name);
}

export function normalizeResult(input, source) {
  if (source === 'xray') return normalizeLinkedInXrayResult(input);
  if (source === 'scout') return normalizeLinkedInScoutResult(input);
  throw new Error(`不支持的来源: ${source}`);
}

cli({
  site: 'hunter-linkedin',
  name: 'normalize',
  access: 'read',
  description: '把 X-Ray 或 Browser Scout 结果转换为 Hunter 统一候选人格式。',
  domain: 'www.linkedin.com',
  strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', default: '', description: '输入 JSON；省略时读取 --source 对应的最新结果' },
    { name: 'source', type: 'string', default: '', description: '结果来源：xray、scout；通常可自动识别' },
    { name: 'output', type: 'string', default: '', description: '输出 JSON；默认写到 LinkedIn 数据目录' },
  ],
  func: async (kwargs) => {
    const requestedSource = String(kwargs.source || '').toLowerCase();
    const inputPath = kwargs.input
      ? path.resolve(expandHome(kwargs.input))
      : findLatestSourceFile(requestedSource);
    if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);

    const input = readJsonFile(inputPath);
    const source = requestedSource || detectSource(input, inputPath);
    const normalized = normalizeResult(input, source);
    const outputPath = kwargs.output
      ? path.resolve(expandHome(kwargs.output))
      : path.join(LINKEDIN_DIR, `normalized-${source}-result.json`);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2), 'utf8');
    console.error(`已标准化 ${normalized.candidates.length} 位候选人: ${outputPath}`);
    return { source, count: normalized.candidates.length, inputPath, outputPath };
  },
});
