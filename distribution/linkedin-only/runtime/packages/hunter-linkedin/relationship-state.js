import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRelationshipState } from './lib/relationship-state.js';
import { readJsonFile } from './lib/json-file.js';

const DEFAULT_OUTPUT = path.join(os.homedir(), '.hunter', 'channels', 'linkedin', 'relationship-state.json');

function expandHome(filePath) {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

export function resolveRelationshipStateFile(inputPath, outputPath = '') {
  const resolvedInput = path.resolve(expandHome(inputPath));
  if (!fs.existsSync(resolvedInput)) throw new Error(`文件不存在: ${resolvedInput}`);

  const input = readJsonFile(resolvedInput);
  const state = resolveRelationshipState(input);
  const resolvedOutput = outputPath ? path.resolve(expandHome(outputPath)) : DEFAULT_OUTPUT;
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, JSON.stringify({
    schemaVersion: 1,
    source: 'hunter-linkedin/relationship-state',
    ...state,
  }, null, 2), 'utf8');
  return { state, inputPath: resolvedInput, outputPath: resolvedOutput };
}

cli({
  site: 'hunter-linkedin',
  name: 'relationship-state',
  access: 'read',
  description: '合并 LinkedIn 连接、待处理邀请、会话与主页动作，输出可追溯的候选人关系状态。',
  domain: 'www.linkedin.com',
  strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, positional: true, description: '关系证据包 JSON 文件路径' },
    { name: 'output', type: 'string', default: '', description: '输出 JSON 路径；默认写入 Hunter LinkedIn 数据目录' },
  ],
  func: async (kwargs) => {
    const result = resolveRelationshipStateFile(kwargs.input, kwargs.output);
    console.error(`关系状态: ${result.state.status}`);
    console.error(`结果已保存: ${result.outputPath}`);
    return {
      status: result.state.status,
      isConnected: result.state.isConnected,
      invitationPending: result.state.invitationPending,
      hasConversation: result.state.hasConversation,
      messageActionVisible: result.state.messageActionVisible,
      canMessage: result.state.canMessage,
      canConnect: result.state.canConnect,
      outputPath: result.outputPath,
    };
  },
});
