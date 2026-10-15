export const filters = {
  keyword: ['关键词', 'text', '.search-auto-complete-box .ant-select-auto-complete input'],
  match: ['关键词匹配', 'select', '.switch-keyword-type'],
  title: ['职位名称', 'autocomplete'], company: ['公司名称', 'autocomplete'],
  city: ['目前城市', 'choice', undefined, 'city'], expectedCity: ['期望城市', 'choice', undefined, 'city'],
  experience: ['工作年限', 'choice'], education: ['教育经历', 'choice'],
  schoolTier: ['院校要求', 'choice'], fullTime: ['统招要求', 'select', '.edu-tz-select'],
  industry: ['当前行业', 'autocomplete'], position: ['当前职位', 'autocomplete'],
  expectedIndustry: ['期望行业', 'autocomplete'], expectedPosition: ['期望职位', 'autocomplete'],
  activity: ['活跃度', 'select'], language: ['语言', 'choice'],
  jobChanges: ['跳槽频率', 'select'], school: ['毕业院校', 'autocomplete'],
  major: ['专业名称', 'autocomplete'], jobStatus: ['求职状态', 'select', '.apply-job-status'],
  resumeLanguage: ['简历语言', 'select'],
  salaryMin: ['目前年薪', 'number', '#nowSalaryLow'], salaryMax: ['目前年薪', 'number', '#nowSalaryHigh'],
  expectedSalaryMin: ['期望年薪', 'number', '#wantSalaryLow'], expectedSalaryMax: ['期望年薪', 'number', '#wantSalaryHigh'],
  ageMin: ['年龄', 'age', '#ageLow'], ageMax: ['年龄', 'age', '#ageHigh'],
  gender: ['性别', 'select'],
  overseas: ['海外工作经验', 'check', 'input[name="workAbroad"]'],
  management: ['管理经验', 'check', 'input[name="managerial"]'],
};
export function plan(args) {
  const allowed = new Set([...Object.keys(filters), 'limit', 'capture', 'pages']);
  for (const key of Object.keys(args)) {
    if (key === '__opencliOptionSources') continue;
    if (!allowed.has(key)) throw new Error(`未知参数: ${key}`);
  }
  const limit = Number(args.limit ?? 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('limit 必须为 1–30 整数');
  const pages = Number(args.pages ?? 1);
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) throw new Error('pages 必须为 1–10 整数');
  const steps = [];
  for (const [key, definition] of Object.entries(filters)) {
    if (args[key] === undefined) continue;
    const value = args[key];
    if (definition[1] === 'check') {
      if (typeof value !== 'boolean') throw new Error(`${key} 必须为布尔值`);
    } else if (definition[1] === 'age') {
      if (!/^\d+$/.test(String(value).trim())) throw new Error(`${key} 必须为非负整数（岁）`);
    } else if (definition[1] === 'number') {
      if (String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${key} 必须为非负数字（万元/年）`);
    } else if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} 不可为空`);
    const step = { key, label: definition[0], kind: definition[1], selector: definition[2], cascade: definition[3] ?? null, value: String(value).trim() };
    // Historical live UI labels include 年; accept the same bounded range with
    // or without its unit, without broad substring or numeric matching.
    if (key === 'experience') {
      const compact = step.value.replace(/\s+/g, '');
      const range = compact.match(/^(\d+)-(\d+)(?:年)?$/);
      const above = compact.match(/^(\d+)(?:年)?以上$/);
      if (range) step.choiceValues = [`${range[1]}-${range[2]}`, `${range[1]}-${range[2]}年`];
      else if (above) step.choiceValues = [`${above[1]}以上`, `${above[1]}年以上`];
    }
    steps.push(step);
  }
  for (const prefix of ['salary', 'expectedSalary', 'age']) {
    if (args[`${prefix}Min`] !== undefined && args[`${prefix}Max`] !== undefined && Number(args[`${prefix}Min`]) > Number(args[`${prefix}Max`])) throw new Error(`${prefix} 下限超过上限`);
  }
  if (!steps.length) throw new Error('至少指定一个搜索条件');
  return { steps, limit, pages };
}
