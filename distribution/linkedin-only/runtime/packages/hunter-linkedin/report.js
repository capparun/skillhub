import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateMarkdownReport, generateCSV, generateJSON } from '@hunter/core';
import { saveLinkedInHTMLReport } from './lib/linkedin-report-html.js';
import { readJsonFile } from './lib/json-file.js';

const OUTPUT_DIR = path.join(os.homedir(), '.hunter', 'output');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return readJsonFile(filePath);
}

// 兼容两种输入：
// 1. { candidates: [...] }（各人内嵌 evaluation）—— 原样返回
// 2. { evaluations: [...], summary }（skill pipeline 产出）—— 转为内嵌 evaluation 的 candidates
function normalizeReportInput(input) {
  if (Array.isArray(input.candidates)) return input;
  if (Array.isArray(input.evaluations)) {
    const candidates = input.evaluations.map((e) => ({
      ...e,
      profileId: e.id || '',
      name: e.name || '',
      title: e.title || '',
      headline: e.title || '',
      location: e.location || '',
      profileUrl: e.profileUrl || '',
      channel: e.channel || 'linkedin',
      evaluation: {
        score: e.score,
        qualified: e.qualified,
        reasons: e.reasons || [],
        risks: e.risks || [],
        highlights: e.highlights || [],
      },
    }));
    return { ...input, candidates };
  }
  if (input && typeof input === 'object' && (input.profileUrl || input.name || input.profileId)) {
    return { candidates: [input] };
  }
  throw new Error('输入 JSON 格式错误：缺少 candidates 或 evaluations 数组');
}

function buildMeta(input, kwargs) {
  const searchParams = input.meta?.searchParams || {};
  const keyword = searchParams.keyword || input.meta?.title || kwargs.title || 'LinkedIn Search';
  const candidates = input.candidates || [];
  const qualified = candidates.filter(c => c.evaluation?.qualified);

  return {
    title: keyword,
    tag: kwargs.tag || `L${keyword.slice(0, 3).toUpperCase()}${new Date().toISOString().slice(5, 10).replace('-', '')}`,
    keywords: [keyword],
    city: searchParams.location || input.meta?.city || '不限',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    rounds: 1,
    total: candidates.length,
    unique: candidates.length,
    detailEvaluated: candidates.filter(c => c.evaluation).length,
    finalQualified: qualified.length,
  };
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

cli({
  site: 'hunter-linkedin',
  name: 'report',
  access: 'read',
  description: '根据 LinkedIn 搜索结果（已评估或未评估）生成 Markdown/CSV/JSON/HTML 报告。',
  domain: 'www.linkedin.com',
  strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, positional: true, description: '搜索结果 JSON 文件路径（可包含 evaluation 字段）' },
    { name: 'formats', type: 'string', default: 'html,csv,md', description: '输出格式，逗号分隔：html,csv,md,json' },
    { name: 'tag', type: 'string', default: '', description: '报告标签。默认从关键词生成' },
    { name: 'title', type: 'string', default: '', description: '报告标题。默认使用搜索关键词' },
    { name: 'outputDir', type: 'string', default: '', description: '输出目录。默认 ~/.hunter/output' },
    { name: 'fields', type: 'string', default: '', description: '兼容旧版参数；新版 HTML 客户简报会自动展示评估证据' },
  ],
  func: async (kwargs) => {
    console.error('='.repeat(60));
    console.error('📄 LinkedIn 报告生成');
    console.error('='.repeat(60));

    const input = normalizeReportInput(loadJson(kwargs.input));

    const formats = kwargs.formats.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const supported = new Set(['html', 'csv', 'md', 'json']);
    for (const f of formats) {
      if (!supported.has(f)) {
        throw new Error(`不支持的格式: ${f}。支持的格式: html, csv, md, json`);
      }
    }

    const meta = buildMeta(input, kwargs);
    const targetCity = meta.city;
    const outputDir = kwargs.outputDir || OUTPUT_DIR;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 默认只输出 qualified 候选人；如果没有 evaluation，则输出全部
    const candidates = input.candidates.some(c => c.evaluation)
      ? input.candidates.filter(c => c.evaluation?.qualified)
      : input.candidates;

    console.error(`候选人: ${input.candidates.length} 人`);
    if (input.candidates.some(c => c.evaluation)) {
      console.error(`符合要求: ${candidates.length} 人`);
    }

    const result = {
      meta,
      generated: [],
    };

    const projectId = sanitizeFilename(meta.title || meta.tag || 'report');
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `${projectId}-${timestamp}`;

    if (formats.includes('json')) {
      const jsonPath = path.join(outputDir, `${prefix}-candidates.json`);
      fs.writeFileSync(jsonPath, generateJSON(meta, candidates, targetCity), 'utf8');
      result.generated.push({ format: 'json', path: jsonPath });
      console.error(`  ✓ JSON: ${jsonPath}`);
    }

    if (formats.includes('csv')) {
      const csvPath = path.join(outputDir, `${prefix}-candidates.csv`);
      fs.writeFileSync(csvPath, generateCSV(candidates, targetCity), 'utf8');
      result.generated.push({ format: 'csv', path: csvPath });
      console.error(`  ✓ CSV: ${csvPath}`);
    }

    if (formats.includes('md')) {
      const mdPath = path.join(outputDir, `${prefix}-report.md`);
      fs.writeFileSync(mdPath, generateMarkdownReport(meta, candidates, targetCity), 'utf8');
      result.generated.push({ format: 'md', path: mdPath });
      console.error(`  ✓ Markdown: ${mdPath}`);
    }

    if (formats.includes('html')) {
      const htmlPath = saveLinkedInHTMLReport(meta, candidates, outputDir);
      result.generated.push({ format: 'html', path: htmlPath });
      console.error(`  ✓ HTML: ${htmlPath}`);
    }

    return result;
  },
});

export const __test__ = {
  normalizeReportInput,
  buildMeta,
};
