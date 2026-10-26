import { cli } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline/promises';
import {
  isValidTier,
  normalizeTier,
  TIER_KEYS,
  getTierLabel,
  formatInMailQuota,
} from './lib/index.js';
import {
  loadHunterConfig,
  saveHunterConfig,
  setLinkedInTier,
  setLinkedInConfig,
} from './lib/index.js';
import { detectTierFromSession } from './lib/index.js';

function ensureConfigDir() {
  const dir = path.join(os.homedir(), '.hunter');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function promptTier(defaultTier = null) {
  console.error('\n请选择 LinkedIn 账号档位：');
  TIER_KEYS.forEach((key, i) => {
    const marker = key === defaultTier ? ' (检测推荐)' : '';
    console.error(`  ${i + 1}. ${getTierLabel(key)}${marker}`);
  });

  const answer = await askQuestion(defaultTier ? `请输入序号 [默认: ${getTierLabel(defaultTier)}]: ` : '请输入序号: ');
  if (!answer && defaultTier) return defaultTier;

  const index = parseInt(answer.trim(), 10) - 1;
  if (index >= 0 && index < TIER_KEYS.length) {
    return TIER_KEYS[index];
  }

  console.error('❌ 无效选择');
  return null;
}

async function confirmTier(detectedTier) {
  const answer = await askQuestion(`检测到可能是「${getTierLabel(detectedTier)}」，是否确认？(y/n) `);
  return /^y/i.test(answer.trim());
}

cli({
  site: 'hunter-linkedin',
  name: 'setup',
  access: 'write',
  description: '配置 LinkedIn 寻访工具（账号档位 / 首选发现路径）',
  domain: 'www.linkedin.com',
  args: [
    { name: 'tier', type: 'string', default: '', description: 'LinkedIn 账号档位: free | premium_career | premium_business | sales_navigator | recruiter_lite | recruiter_corporate | rps' },
    { name: 'preferredDiscovery', type: 'string', default: '', description: '首选发现路径: browser | xray' },
  ],
  func: async (page, kwargs) => {
    console.error('='.repeat(60));
    console.error('🔧 LinkedIn 寻访配置');
    console.error('='.repeat(60));

    ensureConfigDir();
    let config = loadHunterConfig();

    // 配置 LinkedIn 账号档位
    let tierUpdated = false;
    if (kwargs.tier) {
      const normalized = normalizeTier(kwargs.tier);
      if (!isValidTier(normalized)) {
        console.error(`\n❌ 无效的 tier: ${kwargs.tier}`);
        console.error(`   可选值: ${TIER_KEYS.join(', ')}`);
        return { success: false };
      }
      config = setLinkedInTier(config, normalized, {
        preferredDiscovery: kwargs.preferredDiscovery || undefined,
      });
      saveHunterConfig(config);
      console.error(`\n✅ LinkedIn 账号档位设置为: ${getTierLabel(config.linkedin.tier)}`);
      tierUpdated = true;
    } else {
      // 未确认过时尝试自动检测或交互选择
      const detected = await detectTierFromSession(page);
      let chosenTier = null;

      if (detected) {
        console.error(`\n🔍 检测到 LinkedIn 登录态`);
        const confirmed = await confirmTier(detected);
        chosenTier = confirmed ? detected : await promptTier(detected);
      } else {
        console.error('\n⚠️ 无法核实具体订阅，请查看账号订阅页后选择；未识别不代表未登录');
        chosenTier = await promptTier();
      }

      if (chosenTier) {
        config = setLinkedInTier(config, chosenTier, {
          preferredDiscovery: kwargs.preferredDiscovery || undefined,
        });
        saveHunterConfig(config);
        console.error(`\n✅ LinkedIn 账号档位设置为: ${getTierLabel(config.linkedin.tier)}`);
        tierUpdated = true;
      }
    }

    if (kwargs.preferredDiscovery) {
      if (!['browser', 'xray'].includes(kwargs.preferredDiscovery)) throw new Error('无效的 preferredDiscovery');
      config = setLinkedInConfig(config, { preferredDiscovery: kwargs.preferredDiscovery });
      saveHunterConfig(config);
    }

    // 显示当前配置
    console.error('\n📋 当前配置:');
    console.error(`  LinkedIn 档位: ${getTierLabel(config.linkedin?.tier || 'unknown')} (${config.linkedin?.tier || 'unknown'})`);
    console.error(`  首选发现路径: ${config.linkedin?.preferredDiscovery || 'browser'}`);
    if (config.linkedin?.tierConfirmedAt) {
      console.error(`  档位确认时间: ${config.linkedin.tierConfirmedAt}`);
    }

    console.error(`  档位来源: ${config.linkedin?.tierSource || 'unverified'}（配置不代表实时订阅）`);
    console.error(`  ${formatInMailQuota(config.linkedin?.tier)}`);
    console.error(`  本地每日浏览预算: ${config.linkedin?.dailyProfileViewLimit}；不是平台额度或安全保证，当前计数未完整接入。`);
    console.error('\n💡 使用说明:');
    console.error('  opencli hunter linkedin-scout --keyword "AI Engineer" --limit 50');
    console.error('  opencli hunter linkedin-xray --keyword "AI Engineer" --location Shanghai --limit 10');

    return { success: true, config, tierUpdated };
  }
});
