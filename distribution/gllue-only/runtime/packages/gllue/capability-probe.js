import { cli, Strategy } from '@jackwener/opencli/registry';
import { probeGllueCapabilities } from './lib/capability-probe.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'capability-probe',
  description: '只读检查 Gllue 登录、租户、人才/职位入口及可选写入表单',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'includeWrite',
      type: 'boolean',
      required: false,
      description: '同时只读检查候选人新建表单是否可见；不会保存或修改数据'
    }
  ],
  columns: [
    'status', 'tenant', 'domain', 'loggedIn', 'tenantMatches',
    'candidateSearch', 'candidateDetail', 'jobSearch', 'candidateWriteForm', 'checkedAt'
  ],
  func: async (page, kwargs) => probeGllueCapabilities(page, {
    includeWrite: kwargs.includeWrite === true || kwargs.includeWrite === 'true'
  })
});
