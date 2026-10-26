/**
 * 额度追踪：按天记录 LinkedIn 动作消耗（profile 浏览 / 搜索 / 公司查询），
 * 持久化到 ~/.hunter/quota.json。用于给出额度提醒，不是硬性阻断。
 * 注意：CUL 剩余额度 LinkedIn 官方不展示，本模块只记录 Hunter 自身发起的动作次数。
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getLinkedInConfig } from './hunter-config.js';

function getQuotaFile() {
  const dataDir = process.env.HUNTER_DATA_DIR || path.join(os.homedir(), '.hunter');
  return path.join(dataDir, 'quota.json');
}

export const QUOTA_ACTIONS = ['profileView', 'search', 'companyLookup'];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDay() {
  return { profileView: 0, search: 0, companyLookup: 0 };
}

export function loadQuota() {
  const quotaFile = getQuotaFile();
  try {
    if (fs.existsSync(quotaFile)) {
      const data = JSON.parse(fs.readFileSync(quotaFile, 'utf-8'));
      if (data.date !== todayKey()) {
        // 跨天自动重置（历史只保留最近 7 天）
        const history = (data.history || []).concat([{ date: data.date, ...data.counters }]).slice(-7);
        return { date: todayKey(), counters: emptyDay(), history };
      }
      return { date: data.date, counters: { ...emptyDay(), ...data.counters }, history: data.history || [] };
    }
  } catch (e) {
    // 文件损坏时从空状态开始，不阻断命令
  }
  return { date: todayKey(), counters: emptyDay(), history: [] };
}

export function saveQuota(quota) {
  const quotaFile = getQuotaFile();
  fs.mkdirSync(path.dirname(quotaFile), { recursive: true });
  fs.writeFileSync(quotaFile, JSON.stringify(quota, null, 2), 'utf-8');
}

/**
 * 记录一次动作消耗，返回当日累计。
 * @param {'profileView'|'search'|'companyLookup'} action
 */
export function incrementQuota(action) {
  if (!QUOTA_ACTIONS.includes(action)) throw new Error(`unknown quota action: ${action}`);
  const quota = loadQuota();
  quota.counters[action] += 1;
  saveQuota(quota);
  return quota.counters[action];
}

/**
 * 查询当日状态与档位建议上限。
 * @returns {{date: string, counters: object, dailyProfileViewLimit: number, profileViewExceeded: boolean}}
 */
export function getQuotaStatus() {
  const quota = loadQuota();
  const cfg = getLinkedInConfig();
  const limit = cfg.dailyProfileViewLimit || 0;
  return {
    source: 'hunter_local_counter',
    coverage: 'partial',
    platformRemaining: null,
    inmailRemaining: null,
    budgetEnforced: false,
    note: '仅统计已接入计数器的本地动作，不是 LinkedIn 总用量或余额；当前业务路径未完整接入，不能据此判断还可执行多少次。',
    date: quota.date,
    counters: quota.counters,
    dailyProfileViewLimit: limit,
    profileViewExceeded: limit > 0 && quota.counters.profileView >= limit,
  };
}

/**
 * 是否应暂停 profile 浏览（达到当日建议上限）。
 */
export function shouldPauseProfileViews() {
  return getQuotaStatus().profileViewExceeded;
}
