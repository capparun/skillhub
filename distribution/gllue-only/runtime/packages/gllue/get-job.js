import { cli, Strategy } from '@jackwener/opencli/registry';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'get-job',
  description: '查看 Gllue 项目详情',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: '项目 ID'
    }
  ],
  columns: ['id', 'title', 'client', 'location', 'salary', 'status', 'owner'],
  func: async (page, kwargs) => {
    const client = new GllueClient(page);
    const result = await client.getJob(kwargs.id);

    return [result];
  }
});
