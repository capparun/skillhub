import { cli, Strategy } from '@jackwener/opencli/registry';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'get-candidate',
  description: '查看 Gllue 候选人详情',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: '候选人 ID'
    }
  ],
  columns: ['id', 'name', 'company', 'title', 'status', 'appliedJob', 'pipelineStep', 'owner', 'phone', 'email', 'location'],
  func: async (page, kwargs) => {
    const client = new GllueClient(page);
    const result = await client.getCandidate(kwargs.id);

    return [result];
  }
});
