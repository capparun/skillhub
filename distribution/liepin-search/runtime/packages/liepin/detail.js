import { cli } from './lib/register.js';
import { readCurrentDetail } from './lib/current-detail.js';

cli({
  site: 'liepin', name: 'detail', access: 'read', domain: 'h.liepin.com',
  description: '绑定已打开的指定详情标签，读取并保存账号可见内容；不导航；可选展开工作、项目、教育经历',
  browser: false,
  args: [
    { name: 'resumeId', type: 'string', positional: true, required: true, help: '当前详情的 resumeId' },
    { name: 'page', type: 'string', required: true, help: '明确观察到的 Chrome targetId' },
    { name: 'file', type: 'string', required: true, help: '已授权该对象的本地任务 JSON' },
    { name: 'operationId', type: 'string', required: true, help: '持久操作标识，重读同一操作复用结果' },
    { name: 'expand', type: 'boolean', default: false, help: '展开页面已有的其他经历，不索要附件或解锁' },
  ],
  columns: ['resumeId', 'status', 'url', 'capturedAt', 'text', 'sections', 'missingSections', 'warnings'],
  func: async (args) => [await readCurrentDetail(args)],
});
