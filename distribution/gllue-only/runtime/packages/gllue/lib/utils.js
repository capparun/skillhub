import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 随机延迟
 * @param {number[]} range - [min, max] 毫秒
 */
export function randomDelay(range) {
  const [min, max] = range;
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 读取默认配置
 */
export function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'defaults.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const defaults = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const localPath = process.env.GLLUE_CONFIG
    ? path.resolve(process.env.GLLUE_CONFIG)
    : path.join(__dirname, '..', 'config', 'local.json');
  const local = fs.existsSync(localPath)
    ? JSON.parse(fs.readFileSync(localPath, 'utf-8').replace(/^\uFEFF/, ''))
    : {};
  const domain = String(process.env.GLLUE_DOMAIN || local.domain || defaults.domain || '').trim();
  const tenant = String(process.env.GLLUE_TENANT || local.tenant || defaults.tenant || '').trim();
  const protocol = String(process.env.GLLUE_PROTOCOL || local.protocol || defaults.protocol || 'https').trim();
  if (!domain || !tenant || !['http', 'https'].includes(protocol)) {
    throw new Error('Gllue 运行配置缺少有效的 tenant/domain/protocol');
  }
  return {
    ...defaults,
    ...local,
    tenant,
    domain,
    protocol,
    baseUrl: `${protocol}://${domain}`,
    paths: { ...defaults.paths, ...(local.paths || {}) },
    delays: { ...defaults.delays, ...(local.delays || {}) },
    limits: { ...defaults.limits, ...(local.limits || {}) },
    output: { ...defaults.output, ...(local.output || {}) }
  };
}

/**
 * 确保输出目录存在
 */
export function ensureOutputDirs(config) {
  const dirs = [
    config.output.baseDir,
    config.output.candidatesDir,
    config.output.jobsDir,
    config.output.reportsDir,
    config.output.debugDir
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * 生成带时间戳的文件名
 */
export function timestampedFilename(prefix, ext) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}_${ts}.${ext}`;
}

/**
 * 保存 JSON 数据到输出目录
 */
export function saveJson(config, subDir, filename, data) {
  const dir = path.join(config.output.baseDir, subDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

/**
 * 保存 CSV 数据到输出目录
 */
export function saveCsv(config, subDir, filename, rows, headers) {
  const dir = path.join(config.output.baseDir, subDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  const escapeCell = (val) => `"${String(val).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map(r => headers.map(h => escapeCell(r[h] ?? '')).join(','))
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

/**
 * 安全获取嵌套对象属性
 */
export function get(obj, pathStr, defaultValue = undefined) {
  return pathStr.split('.').reduce((acc, key) => {
    if (acc == null) return defaultValue;
    return acc[key] ?? defaultValue;
  }, obj);
}

/**
 * 截断字符串
 */
export function truncate(str, maxLen = 100) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/**
 * 解析 Gllue 职位文本："#351 LAOWAI HERE- Marketing Associate" → { jobId, jobTitle }
 */
export function parseJobApplicationText(text) {
  if (!text) return { jobId: '', jobTitle: '' };
  const match = text.match(/#(\d+)\s+(.+?)(?:\s*-|$)/);
  if (match) return { jobId: match[1], jobTitle: match[2].trim() };
  return { jobId: '', jobTitle: text };
}

/**
 * 解析 pipeline 状态 → 摘要 label（如 "Step 3/5"）
 */
export function parsePipelineStatus(completedSteps, currentStep, totalSteps) {
  if (!totalSteps) return { currentStep: 0, totalSteps: 0, completedSteps: 0, label: '' };
  const label = currentStep ? `Step ${currentStep}/${totalSteps}` : '';
  return { currentStep, totalSteps, completedSteps, label };
}
