import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import fs from 'fs';
import path from 'path';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig } from './lib/auth.js';

cli({
  site: 'gllue',
  name: 'check-exists',
  description: '检查 LinkedIn 等外部渠道的候选人是否已存在于 Gllue 人才库',
  access: 'read',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    {
      name: 'name',
      type: 'string',
      required: false,
      description: '候选人姓名（如：Raffael Krause）'
    },
    {
      name: 'email',
      type: 'string',
      required: false,
      description: '候选人邮箱（最强匹配依据）'
    },
    {
      name: 'company',
      type: 'string',
      required: false,
      description: '当前/最近公司；仅辅助查重，不能单独使用'
    },
    {
      name: 'title',
      type: 'string',
      required: false,
      description: '当前/最近职位；仅辅助查重，不能单独使用'
    },
    {
      name: 'linkedinUrl',
      type: 'string',
      required: false,
      description: 'LinkedIn 个人主页 URL（如：https://www.linkedin.com/in/xxx）'
    },
    {
      name: 'file',
      type: 'string',
      required: false,
      description: '候选人 JSON 文件路径（批量/自动化场景使用）'
    },
    {
      name: 'threshold',
      type: 'int',
      required: false,
      default: 60,
      description: '判定为"已存在"的置信度阈值（0-100）'
    },
    {
      name: 'limit',
      type: 'int',
      required: false,
      default: 20,
      description: '每次搜索最多返回条数'
    }
  ],
  columns: ['status', 'identityConfirmed', 'totalChecked', 'bestMatch', 'matches', 'filePath'],
  func: async (page, kwargs) => {
    const threshold = kwargs.threshold ?? 60;
    if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 100) {
      throw new ArgumentError('threshold 必须是 0 到 100 的整数');
    }
    const limit = kwargs.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new ArgumentError('limit 必须是正整数');
    }
    // 前置输入校验：避免走到浏览器/登录检查才发现参数问题
    const hasInput = kwargs.name || kwargs.email || kwargs.company || kwargs.title || kwargs.linkedinUrl || kwargs.file;
    if (!hasInput) {
      throw new Error('请至少提供一种搜索条件：--name、--email、--company、--title、--linkedinUrl 或 --file');
    }

    let profile;

    if (kwargs.file) {
      const filePath = path.resolve(kwargs.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }
      profile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      profile = {
        name: kwargs.name,
        email: kwargs.email,
        company: kwargs.company,
        title: kwargs.title,
        linkedinUrl: kwargs.linkedinUrl
      };
    }

    const client = new GllueClient(page);
    if (!String(profile?.name ?? '').trim() && !String(profile?.email ?? '').trim() &&
        !client.extractLinkedInIdentifier(profile?.linkedinUrl)) {
      throw new ArgumentError('请至少提供姓名或邮箱，或有效 LinkedIn 个人链接；公司和职位只能辅助查重');
    }
    const result = await client.checkExists(profile, {
      threshold,
      limit
    });

    return {
      status: result.status,
      identityConfirmed: false,
      totalChecked: result.totalChecked,
      bestMatch: result.bestMatch,
      matches: result.matches,
      filePath: result.filePath
    };
  }
});
