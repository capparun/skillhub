import fs from 'fs';
import path from 'path';
import os from 'os';
import { isValidTier, normalizeTier, TIER_KEYS, getDefaultDiscovery, getTierConfig } from './linkedin-tier.js';

export const CONFIG_DIR = path.join(os.homedir(), '.hunter');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_LINKEDIN_CONFIG = Object.freeze({
  tier: 'unknown',
  preferredDiscovery: 'xray',
  dailyProfileViewLimit: 20,
  rateLimits: {
    searchDelayMs: 5000,
    profileViewDelayMs: 3000,
    companyLookupDelayMs: 3000,
  },
});

export const DEFAULT_GLOBAL_CONFIG = Object.freeze({
  retentionDays: 365,
});

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadHunterConfig() {
  try {
    const raw = fs.readFileSync(path.join(process.env.HUNTER_DATA_DIR || CONFIG_DIR, 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return migrateConfig(parsed);
  } catch {
    return migrateConfig({});
  }
}

export function saveHunterConfig(config) {
  const dir = process.env.HUNTER_DATA_DIR || CONFIG_DIR;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
}

/**
 * 将旧版平铺配置迁移到新的结构化配置。
 */
export function migrateConfig(config = {}) {
  const migrated = { ...config };

  // 清理已下线的 Apify 遗留字段（能力已移除，遗留 token 不再保留）
  delete migrated.apifyToken;
  // 清理已无读者的 defaultProvider 遗留字段
  delete migrated.defaultProvider;

  // 全局默认值
  for (const [key, value] of Object.entries(DEFAULT_GLOBAL_CONFIG)) {
    if (migrated[key] === undefined) {
      migrated[key] = value;
    }
  }

  // LinkedIn 子对象
  if (!migrated.linkedin || typeof migrated.linkedin !== 'object') {
    migrated.linkedin = {};
  }

  const linkedin = { ...migrated.linkedin };
  const discoveryExplicit = linkedin.preferredDiscovery !== undefined;
  for (const [key, value] of Object.entries(DEFAULT_LINKEDIN_CONFIG)) {
    if (linkedin[key] === undefined) {
      linkedin[key] = JSON.parse(JSON.stringify(value));
    }
  }

  // 修正无效的 tier
  if (!isValidTier(linkedin.tier)) {
    const normalized = normalizeTier(linkedin.tier);
    linkedin.tier = normalized || DEFAULT_LINKEDIN_CONFIG.tier;
  }

  // 修正无效的 preferredDiscovery；未显式设置时按 tier 推导默认路径
  const validDiscoveries = ['browser', 'xray'];
  if (!validDiscoveries.includes(linkedin.preferredDiscovery)) {
    linkedin.preferredDiscovery = getDefaultDiscovery(linkedin.tier);
  } else if (!discoveryExplicit) {
    linkedin.preferredDiscovery = getDefaultDiscovery(linkedin.tier);
  }

  // Track defaults explicitly; legacy values remain user-owned, even when equal to a default.
  for (const field of ['preferredDiscovery', 'dailyProfileViewLimit']) {
    if (migrated.linkedin[field] === undefined) {
      linkedin[`${field}Source`] = 'default';
      if (field === 'dailyProfileViewLimit') linkedin[field] = getTierConfig(linkedin.tier).dailyProfileViewSafe;
    }
  }
  linkedin.tierSource ||= linkedin.tierConfirmedAt ? 'manual_legacy' : 'unverified';
  migrated.linkedin = linkedin;
  return migrated;
}

export function getLinkedInConfig(config = loadHunterConfig()) {
  return migrateConfig(config).linkedin;
}

export function getLinkedInTier(config = loadHunterConfig()) {
  return getLinkedInConfig(config).tier;
}

export function setLinkedInConfig(config, updates) {
  const migrated = migrateConfig(config);
  migrated.linkedin = { ...migrated.linkedin, ...updates };
  for (const field of ['preferredDiscovery', 'dailyProfileViewLimit']) {
    if (Object.hasOwn(updates, field) && !Object.hasOwn(updates, `${field}Source`)) {
      migrated.linkedin[`${field}Source`] = 'manual';
    }
  }
  return migrated;
}

export function setLinkedInTier(config, tier, { confirmedAt = new Date().toISOString(), preferredDiscovery } = {}) {
  if (!isValidTier(tier)) {
    throw new Error(`无效的 LinkedIn 账号档位: ${tier}，可选值: ${TIER_KEYS.join(', ')}`);
  }

  const updates = {
    tier,
    tierConfirmedAt: confirmedAt,
    tierSource: 'manual',
  };

  if (preferredDiscovery) {
    if (!['browser', 'xray'].includes(preferredDiscovery)) throw new Error('无效的 preferredDiscovery');
    updates.preferredDiscovery = preferredDiscovery;
    updates.preferredDiscoverySource = 'manual';
  } else if (config.linkedin?.preferredDiscovery === undefined || config.linkedin?.preferredDiscoverySource === 'default') {
    updates.preferredDiscovery = getDefaultDiscovery(tier);
    updates.preferredDiscoverySource = 'default';
  }

  if (config.linkedin?.dailyProfileViewLimit === undefined || config.linkedin?.dailyProfileViewLimitSource === 'default') {
    updates.dailyProfileViewLimit = getTierConfig(tier).dailyProfileViewSafe;
    updates.dailyProfileViewLimitSource = 'default';
  }

  return setLinkedInConfig(config, updates);
}
