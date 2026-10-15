import { cli } from './lib/register.js';
import { filters } from './lib/filters.js';
cli({ site: 'liepin', access: 'read', name: 'conditions', description: '列出本版支持的筛选参数及交互类型（离线）', browser: false,
  columns: ['field', 'label', 'interaction'],
  func: async () => Object.entries(filters).map(([field, [label, interaction]]) => ({ field, label, interaction })),
});
