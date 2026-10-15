import { cli, Strategy } from '@jackwener/opencli/registry';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'search-jobs',
  description: '在 Gllue 中搜索项目（职位）',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: false,
      description: '项目关键词'
    },
    {
      name: 'limit',
      type: 'int',
      required: false,
      default: 20,
      description: '最多返回条数'
    }
  ],
  columns: ['id', 'title', 'client', 'status', 'livedays', 'cvsent', 'interviews'],
  func: async (page, kwargs) => {
    const client = new GllueClient(page);
    const result = await client.searchJobs({
      keyword: kwargs.keyword,
      limit: kwargs.limit
    });

    return result.jobs;
  }
});
