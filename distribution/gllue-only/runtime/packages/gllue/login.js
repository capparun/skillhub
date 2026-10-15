import { cli, Strategy } from '@jackwener/opencli/registry';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'login',
  description: '打开 Gllue 登录页并等待用户完成登录',
  access: 'write',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'timeout',
      type: 'int',
      required: false,
      default: 300,
      description: '最大等待登录时间（秒）'
    }
  ],
  columns: ['status', 'url', 'message'],
  func: async (page, kwargs) => {
    const client = new GllueClient(page);
    const timeoutMs = kwargs.timeout * 1000;
    const result = await client.login(timeoutMs);

    return {
      status: 'success',
      url: result.url,
      message: 'Gllue 登录成功'
    };
  }
});
