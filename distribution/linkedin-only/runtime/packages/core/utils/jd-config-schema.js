/**
 * JD 配置 schema 定义和加载器
 * 支持动态评估规则：硬性要求 / 加分项 / 排除项 / 计分权重
 */

export const DEFAULT_JD_CONFIG = {
  title: '',
  hard_requirements: {},
  bonus_items: {},
  exclude_items: {},
  scoring: {
    max_score: 100,
    pass_score: 60,
    weights: {
      hard_requirements: 70,
      bonus_items: 30
    }
  }
};

/**
 * 加载并验证 JD 配置文件
 * @param {string} filePath - JSON 文件路径
 * @returns {object} 合并后的配置
 */
import fs from 'fs';

export function loadJDConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`JD 配置文件不存在: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return { ...DEFAULT_JD_CONFIG, ...parsed };
}

/**
 * 硬性要求字段说明（用于 error message）
 */
export const HARD_REQUIREMENT_KEYS = [
  'must_have_keywords',   // 简历中必须出现的关键词列表
  'certificates',         // 证书要求
  'education',            // 学历要求（如"统招本科"）
  'company_background',   // 公司背景关键词
  'max_job_hops',         // 最大跳槽次数
  'max_age',              // 最大年龄
  'min_age',              // 最小年龄
  'gender',               // 性别
  'min_work_years',       // 最少工作年限
];

/**
 * 加分项字段说明
 */
export const BONUS_KEYS = [
  'target_companies',     // 目标公司列表
  'skills',               // 技能关键词
  'experience_years',     // { min, ideal }
];

/**
 * 排除项字段说明
 */
export const EXCLUDE_KEYS = [
  'companies',            // 排除公司
  'keywords',             // 排除关键词
];

/**
 * 将工作年限数字映射为猎聘筛选选项
 * @param {number} years - 最少工作年限
 * @returns {string} 猎聘 workYear 选项值
 */
function mapWorkYears(years) {
  if (years <= 1) return '1年以下';
  if (years <= 3) return '1-3年';
  if (years < 5) return '3-5年';
  if (years <= 10) return '5-10年';
  return '10年以上';
}

/**
 * 放宽工作年限筛选选项（降一级）
 * @param {string} current - 当前 workYear 值
 * @returns {string|null} 降一级后的值，null 表示已最宽
 */
export function downgradeWorkYear(current) {
  const map = {
    '10年以上': null,
    '5-10年': '3-5年',
    '3-5年': '1-3年',
    '1-3年': '1年以下',
    '1年以下': null,
  };
  return map[current] !== undefined ? map[current] : current;
}

/**
 * 动态生成筛选条件放宽顺序
 * @param {object} jdConfig - JD 配置
 * @param {object} explicitFilters - 用户显式传入的筛选条件
 * @returns {Array} 放宽步骤数组
 */
export function getRelaxationOrder(jdConfig, explicitFilters = {}) {
  const steps = [];

  // 只放宽 JD 自动映射或用户显式设置的字段
  const has = (key) => explicitFilters[key] || (jdConfig && mapHardRequirementsToFilters(jdConfig)[key]);

  if (has('gender')) steps.push({ name: '去掉性别', remove: ['gender'] });
  if (has('schoolLevel')) steps.push({ name: '去掉学校档次', remove: ['schoolLevel'] });
  if (has('eduType')) steps.push({ name: '去掉统招类型', remove: ['eduType'] });
  if (has('updateTime')) steps.push({ name: '去掉更新时间', remove: ['updateTime'] });
  if (has('workYear')) steps.push({ name: '放宽年限', relaxWorkYear: true });
  if (has('education')) steps.push({ name: '去掉学历', remove: ['education'] });
  if (has('ageMin') || has('ageMax')) steps.push({ name: '去掉年龄', remove: ['ageMin', 'ageMax'] });

  return steps;
}

/**
 * 将 JD 配置中的硬性要求映射为猎聘页面筛选参数
 * 这样可以让服务器端先过滤，减少加载量和误判
 * @param {object} jdConfig - JD 配置
 * @returns {object} 筛选参数对象，可直接传给 filter-engine
 */
export function mapHardRequirementsToFilters(jdConfig) {
  const hard = jdConfig?.hard_requirements || {};
  const filters = {};

  if (hard.max_age) filters.ageMax = hard.max_age;
  if (hard.min_age) filters.ageMin = hard.min_age;
  if (hard.gender) filters.gender = hard.gender;
  if (hard.education) {
    // 提取基础学历（去掉"统招"前缀）
    const edu = hard.education.replace(/^统招/, '');
    filters.education = edu;
    // 若包含"统招"前缀，同时设置统招类型
    if (hard.education.startsWith('统招')) {
      filters.eduType = hard.education;
    }
  }
  if (hard.min_work_years) {
    filters.workYear = mapWorkYears(hard.min_work_years);
  }
  // 若有 detailText 才精确判断的字段，列表页不映射为筛选器（避免过度限制）
  // must_have_keywords, certificates, company_background, max_job_hops

  return filters;
}
