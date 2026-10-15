import { cli, Strategy } from '@jackwener/opencli/registry';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'search-candidates',
  description: '在 Gllue 人才库中搜索候选人',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: false,
      description: '身份查找：含 @ 按邮箱，否则按姓名；岗位技能请用 --full-text'
    },
    {
      name: 'full-text',
      type: 'string',
      required: false,
      description: '全文关键词（与 keyword 互斥）'
    },
    {
      name: 'scope',
      type: 'string',
      required: false,
      default: 'accessible',
      description: 'mine 我的候选人；accessible 当前账号可访问的人才'
    },
    {
      name: 'limit',
      type: 'int',
      required: false,
      default: 20,
      description: '最多返回条数'
    }
  ],
  columns: ['id', 'name', 'company', 'title', 'status', 'owner', 'location', 'nationality'],
  func: async (page, kwargs) => {
    const client = new GllueClient(page);
    const result = await client.searchCandidates({
      keyword: kwargs.keyword,
      fullText: kwargs['full-text'],
      scope: kwargs.scope,
      limit: kwargs.limit
    });

    return result.candidates;
  }
});
