/**
 * 合规元数据：为所有落盘的人才数据附加来源、采集时间、保留期限、账号档位。
 * 统一 linkedin-tags.csv schema:
 *   profileId,name,nameCN,tags,keyword,location,time,platform,source,collectedAt,retentionUntil,accountTier,openProfile
 */

import { loadHunterConfig, getLinkedInTier } from './hunter-config.js';

export const TAGS_CSV_HEADER = 'profileId,name,nameCN,tags,keyword,location,time,platform,source,collectedAt,retentionUntil,accountTier,openProfile\n';

/**
 * 计算保留截止时间。
 * @param {Date} [from]
 * @param {number} [retentionDays] - 默认取 config.retentionDays（365）
 */
export function getRetentionUntil(from = new Date(), retentionDays) {
  const days = retentionDays ?? loadHunterConfig().retentionDays ?? 365;
  const until = new Date(from.getTime() + days * 24 * 3600 * 1000);
  return until.toISOString();
}

/**
 * 构造合规字段。
 * @param {string} source - 采集命令名，如 'linkedin-scout'
 * @param {object} [opts]
 * @param {string} [opts.openProfile] - '' 未知 / 'yes' / 'no'
 */
export function buildComplianceFields(source, { openProfile = '' } = {}) {
  return {
    source,
    collectedAt: new Date().toISOString(),
    retentionUntil: getRetentionUntil(),
    accountTier: getLinkedInTier(),
    openProfile,
  };
}

/**
 * 把一条 tags 记录序列化为 CSV 行（含合规列）。
 * 字段中含逗号/引号时按 CSV 规则转义。
 */
export function formatTagsCsvRow({ profileId, name = '', nameCN = '', tags = '', keyword = '', location = '', time = '', platform = 'linkedin', ...compliance }) {
  const fields = [profileId, name, nameCN, tags, keyword, location, time, platform,
    compliance.source || '', compliance.collectedAt || '', compliance.retentionUntil || '',
    compliance.accountTier || '', compliance.openProfile || ''];
  return fields.map(escapeCsv).join(',') + '\n';
}

function escapeCsv(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
