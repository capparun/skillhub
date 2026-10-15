import { truncate } from './utils.js';

/**
 * 解析候选人列表行
 */
export function parseCandidateRow(rowEl) {
  const text = rowEl.innerText || '';
  const id = rowEl.getAttribute('data-candidate-id')
    || rowEl.querySelector('[data-candidate-id]')?.getAttribute('data-candidate-id')
    || '';

  // 姓名：优先从 .candidate-name 或 .name 获取
  const nameEl = rowEl.querySelector('.candidate-name, .name, h3');
  const name = nameEl?.textContent?.trim() || '';

  // 当前公司/职位
  const companyEl = rowEl.querySelector('.current-company, [data-field="company"]');
  const titleEl = rowEl.querySelector('.current-title, [data-field="title"]');

  return {
    id,
    name,
    company: companyEl?.textContent?.trim() || '',
    title: titleEl?.textContent?.trim() || '',
    rawText: truncate(text, 500)
  };
}

/**
 * 解析候选人详情页
 */
export function parseCandidateDetail(document) {
  const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';

  return {
    name: getText('.candidate-detail-name, .detail-name, h1'),
    phone: getText('.phone, [data-field="phone"]'),
    email: getText('.email, [data-field="email"]'),
    company: getText('.current-company, [data-field="company"]'),
    title: getText('.current-title, [data-field="title"]'),
    location: getText('.location, [data-field="location"]'),
    salary: getText('.salary, [data-field="salary"]'),
    summary: getText('.summary, [data-field="summary"]')
  };
}

/**
 * 解析职位列表行
 */
export function parseJobRow(rowEl) {
  const id = rowEl.getAttribute('data-job-id')
    || rowEl.querySelector('[data-job-id]')?.getAttribute('data-job-id')
    || '';

  const titleEl = rowEl.querySelector('.job-title, .title, h3');
  const companyEl = rowEl.querySelector('.job-company, [data-field="company"]');
  const locationEl = rowEl.querySelector('.job-location, [data-field="location"]');

  return {
    id,
    title: titleEl?.textContent?.trim() || '',
    company: companyEl?.textContent?.trim() || '',
    location: locationEl?.textContent?.trim() || ''
  };
}

/**
 * 解析职位详情页
 */
export function parseJobDetail(document) {
  const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';

  return {
    title: getText('.job-detail-title, .detail-title, h1'),
    company: getText('.job-company, [data-field="company"]'),
    location: getText('.job-location, [data-field="location"]'),
    salary: getText('.job-salary, [data-field="salary"]'),
    description: getText('.job-description, [data-field="description"]'),
    requirements: getText('.job-requirements, [data-field="requirements"]')
  };
}
