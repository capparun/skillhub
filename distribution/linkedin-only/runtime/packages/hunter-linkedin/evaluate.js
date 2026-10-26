import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { evaluateLinkedInCandidates, buildCriteriaFromJD, buildCriteriaFromPlan } from './lib/index.js';
import { readJsonFile } from './lib/json-file.js';

const CONFIG_DIR = path.join(os.homedir(), '.hunter', 'channels', 'linkedin');
const EVALUATED_RESULT_FILE = path.join(CONFIG_DIR, 'linkedin-evaluated-result.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return readJsonFile(filePath);
}

function resolveSearchParams(input, kwargs) {
  // 命令行显式参数优先级最高
  const params = { ...input.meta?.searchParams };
  if (kwargs.keyword) params.keyword = kwargs.keyword;
  if (kwargs.location) params.location = kwargs.location;
  if (kwargs.connection) params.connection = kwargs.connection;
  if (kwargs.currentCompany) params.currentCompany = kwargs.currentCompany;
  if (kwargs.pastCompany) params.pastCompany = kwargs.pastCompany;
  if (kwargs.school) params.school = kwargs.school;
  if (kwargs.industry) params.industry = kwargs.industry;
  if (kwargs.language) params.language = kwargs.language;
  return params;
}

function buildCriteria(input, kwargs) {
  const searchParams = resolveSearchParams(input, kwargs);

  // 如果提供了 JD 配置，优先从 JD 构建条件
  if (kwargs.plan) {
    const planDoc = loadJson(kwargs.plan);
    const channel = kwargs.channel || 'linkedin';
    const plan = planDoc?.channelPlans?.[channel];
    if (!plan) throw new Error(`方案文件中找不到 channelPlans.${channel}`);
    const planCriteria = buildCriteriaFromPlan(plan);
    return {
      ...planCriteria,
      keywords: kwargs.keywords ? [...new Set([...planCriteria.keywords, ...kwargs.keywords.split(/[,，\s]+/).filter(Boolean)])] : planCriteria.keywords,
      minScore: kwargs.minScore ?? planCriteria.minScore,
    };
  }

  // 如果提供了 JD 配置，优先从 JD 构建条件
  if (kwargs.jd) {
    const jdConfig = loadJson(kwargs.jd);
    return buildCriteriaFromJD(jdConfig, searchParams, { minScore: kwargs.minScore });
  }

  // 否则用命令行显式参数或搜索参数
  const keywords = new Set();
  if (searchParams.keyword) {
    keywords.add(searchParams.keyword.trim());
  }
  if (kwargs.keywords) {
    kwargs.keywords.split(/[,，\s]+/).filter(Boolean).forEach(k => keywords.add(k));
  }

  const targetCompanies = new Set();
  if (kwargs.targetCompanies) {
    kwargs.targetCompanies.split(/[,，\s]+/).filter(Boolean).forEach(c => targetCompanies.add(c));
  }
  if (searchParams.currentCompany) {
    searchParams.currentCompany.split(/[,，\s]+/).filter(Boolean).forEach(c => targetCompanies.add(c));
  }

  const targetLocations = new Set();
  if (kwargs.targetLocations) {
    kwargs.targetLocations.split(/[,，\s]+/).filter(Boolean).forEach(l => targetLocations.add(l));
  }
  if (searchParams.location) {
    searchParams.location.split(/[,，\s]+/).filter(Boolean).forEach(l => targetLocations.add(l));
  }

  return {
    keywords: Array.from(keywords),
    targetCompanies: Array.from(targetCompanies),
    targetLocations: Array.from(targetLocations),
    minScore: kwargs.minScore ?? 25
  };
}

cli({
  site: 'hunter-linkedin',
  name: 'evaluate',
  access: 'read',
  description: '对 LinkedIn 搜索结果做规则评估打分。输入为 linkedin-scout 或 opencli people-search 生成的统一 schema JSON。',
  domain: 'www.linkedin.com',
  strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, positional: true, description: '搜索结果 JSON 文件路径' },
    { name: 'jd', type: 'string', default: '', description: 'JD 配置文件路径（JSON）。若提供，将按 JD 中的硬性要求/加分项评估' },
    { name: 'plan', type: 'string', default: '', description: '寻访方案文件路径（align.json）。若提供，按 channelPlans.<channel> 的 filters/scoring 评估' },
    { name: 'channel', type: 'string', default: 'linkedin', description: '寻访方案渠道键，默认 linkedin' },
    { name: 'keywords', type: 'string', default: '', description: '额外关键词，逗号/空格分隔' },
    { name: 'targetCompanies', type: 'string', default: '', description: '目标公司，逗号分隔' },
    { name: 'targetLocations', type: 'string', default: '', description: '目标地点，逗号分隔' },
    { name: 'minScore', type: 'int', default: undefined, description: '最低匹配分数（0-100）；显式传入时覆盖 JD/Plan 门槛，均未提供时默认 25' },
    { name: 'output', type: 'string', default: '', description: '输出 JSON 文件路径。默认保存到 ~/.hunter/channels/linkedin/linkedin-evaluated-result.json' },
  ],
  func: async (kwargs) => {
    console.error('='.repeat(60));
    console.error('🧪 LinkedIn 候选人评估');
    console.error('='.repeat(60));

    const input = loadJson(kwargs.input);
    if (!Array.isArray(input.candidates)) {
      throw new Error('输入 JSON 格式错误：缺少 candidates 数组');
    }

    const criteria = buildCriteria(input, kwargs);
    console.error(`评估条件:`);
    console.error(`  关键词: ${criteria.keywords.join(', ') || '(无)'}`);
    console.error(`  目标公司: ${criteria.targetCompanies.join(', ') || '(无)'}`);
    console.error(`  目标地点: ${criteria.targetLocations.join(', ') || '(无)'}`);
    console.error(`  最低分数: ${criteria.minScore}`);

    const evaluated = evaluateLinkedInCandidates(input.candidates, criteria);
    const qualified = evaluated.filter(c => c.evaluation?.qualified);

    const result = {
      meta: {
        ...(input.meta || {}),
        source: 'linkedin-evaluate',
        evaluatedAt: new Date().toISOString(),
        criteria,
      },
      candidates: evaluated,
    };

    const outputPath = kwargs.output || EVALUATED_RESULT_FILE;
    ensureConfigDir();
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.error(`\n📋 评估完成:`);
    console.error(`   总人数: ${evaluated.length}`);
    console.error(`   ✅ 符合要求: ${qualified.length}人`);
    console.error(`   ⚠️  不匹配: ${evaluated.length - qualified.length}人`);
    console.error(`\n💾 结果已保存: ${outputPath}`);

    return {
      total: evaluated.length,
      qualified: qualified.length,
      outputPath,
    };
  },
});
