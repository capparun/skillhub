/**
 * LinkedIn 关系分析工具函数
 * 从页面文本中提取与当前用户的关系信息
 */

import { getTierConfig } from './linkedin-tier.js';

/**
 * 从页面文本中提取人脉度数
 * @param {string} bodyText - 页面文本内容
 * @returns {string|null} - 人脉度数 (如 "1度", "2度", "3度") 或 null
 */
export function extractConnectionDegree(bodyText) {
  if (!bodyText) return null;

  // 策略1: 标准格式匹配
  let match = bodyText.match(/([123])\s*[度°]/);
  if (match) return match[1] + '度';

  // 策略2: 带空格格式
  match = bodyText.match(/([123])\s*度/);
  if (match) return match[1] + '度';

  // 策略3: 从 "度" 字前面搜索数字
  const idx = bodyText.indexOf('度');
  if (idx > 0) {
    const before = bodyText.substring(Math.max(0, idx - 10), idx);
    const numMatch = before.match(/([123])/);
    if (numMatch) return numMatch[1] + '度';
  }

  return null;
}

/**
 * 判断连接状态
 * @param {string} bodyText - 页面文本内容
 * @param {Array} buttons - 按钮元素列表 (在浏览器环境中)
 * @returns {boolean} - 是否已建立连接
 */
export function extractIsConnected(bodyText, buttons = []) {
  if (bodyText === null || bodyText === undefined) return false;

  const text = bodyText.toLowerCase();

  // 从按钮文字判断
  for (const btn of buttons) {
    let btnText = '';
    if (typeof btn === 'string') {
      btnText = btn;
    } else if (btn.textContent) {
      btnText = btn.textContent;
    } else if (btn.getAttribute) {
      btnText = btn.getAttribute('aria-label') || '';
    }
    btnText = btnText.toLowerCase();
    if (btnText.includes('已连接') || btnText.includes('connected')) {
      return true;
    }
  }

  // 从页面文本判断
  if (text.includes('已连接') || text.includes('connected')) {
    return true;
  }

  return false;
}

/**
 * 判断是否可以发消息
 * @param {string} bodyText - 页面文本内容
 * @param {Array} buttons - 按钮元素列表 (在浏览器环境中)
 * @returns {boolean} - 是否可以直接发消息
 */
export function extractCanMessage(bodyText, buttons = []) {
  if (bodyText === null || bodyText === undefined) return false;

  const text = bodyText.toLowerCase();

  // 从按钮文字判断
  for (const btn of buttons) {
    let btnText = '';
    if (typeof btn === 'string') {
      btnText = btn;
    } else if (btn.textContent) {
      btnText = btn.textContent;
    } else if (btn.getAttribute) {
      btnText = btn.getAttribute('aria-label') || '';
    }
    btnText = btnText.toLowerCase();
    if (btnText.includes('发消息') || btnText.includes('message')) {
      return true;
    }
  }

  // 从页面文本判断
  if (text.includes('发消息') || text.includes('message')) {
    return true;
  }

  return false;
}

/**
 * 提取共同好友数
 * @param {string} bodyText - 页面文本内容
 * @returns {number} - 共同好友数量
 */
export function extractMutualConnections(bodyText) {
  if (!bodyText) return 0;

  const match = bodyText.match(/(\d+)\s*[位个]?\s*共同好/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return 0;
}

/**
 * 分析关系并返回完整信息
 * @param {string} bodyText - 页面文本内容
 * @returns {Object} - 关系分析结果
 */
export function analyzeRelationship(bodyText) {
  return {
    connectionDegree: extractConnectionDegree(bodyText),
    isConnected: extractIsConnected(bodyText),
    canMessage: extractCanMessage(bodyText),
    mutualConnections: extractMutualConnections(bodyText),
  };
}

/**
 * 获取消息权限说明
 * @param {string} degree - 人脉度数
 * @param {boolean} canMessage - 是否可以直接发消息
 * @returns {string} - 消息权限说明
 */
export function getMessagingDescription(degree, canMessage) {
  if (canMessage) return '可以直接发送消息';
  if (degree === '2度') return '需要付费 InMail 或请求介绍';
  if (degree === '3度') return '需要付费 InMail';
  return '未知';
}

/**
 * 获取关系建立策略建议
 * @param {string} degree - 人脉度数
 * @param {boolean} isConnected - 是否已连接
 * @param {number} mutualConnections - 共同好友数
 * @returns {Array<string>} - 策略建议列表
 */
export function getRelationshipStrategy(degree, isConnected, mutualConnections) {
  if (isConnected) {
    return ['已是好友，可以直接发送消息', '定期互动内容，保持关系活跃'];
  }

  if (degree === '2度' && mutualConnections > 0) {
    return [
      '2度人脉，有共同好友',
      '最佳策略: 请共同好友帮忙介绍',
      '或先关注对方，互动内容建立 familiarity',
      '再发送个性化连接请求',
    ];
  }

  if (degree === '2度') {
    return [
      '2度人脉，无共同好友',
      '策略: 先关注对方，互动内容，再发送连接请求',
    ];
  }

  if (degree === '3度') {
    return [
      '3度人脉，距离较远',
      '策略: 先关注对方，定期互动内容',
      '尝试通过共同群组建立联系',
      '或考虑付费 InMail（如职位紧急）',
    ];
  }

  return ['关系状态未知', '建议: 尝试关注或发送连接请求'];
}

/**
 * 检测 Open Profile（开放资料）。
 * Open Profile 用户允许任何人免费发 InMail，不消耗额度（官方规则）。
 * @param {string} bodyText - 页面文本内容
 * @returns {boolean|null} - true/false 检测到，null 无法判断
 */
export function extractOpenProfile(bodyText) {
  if (!bodyText) return null;
  if (/Open Profile|开放资料|open to receiving messages/i.test(bodyText)) return true;
  return null;
}

/**
 * 基于关系 + Open Profile + 账号档位给出推荐触达动作（只读建议，不自动发送）。
 * @param {Object} rel - analyzeRelationship 结果
 * @param {Object} [opts]
 * @param {boolean|null} [opts.openProfile]
 * @param {string} [opts.tier] - LinkedIn 账号档位
 * @returns {{action: string, reason: string, costNote: string}}
 */
export function getRecommendedAction(rel, { openProfile = null, tier = '' } = {}) {
  const { connectionDegree: degree, isConnected, canMessage } = rel || {};

  if (isConnected || canMessage) {
    return { action: 'message', reason: '一度人脉，可直接发消息', costNote: '免费' };
  }
  if (openProfile) {
    return { action: 'inmail', reason: '对方开启 Open Profile，可免费发 InMail', costNote: '不消耗 InMail 额度（官方）' };
  }
  if (degree === '2度') {
    return { action: 'connect_note', reason: '2度人脉，建议发送个性化连接请求或请共同好友介绍', costNote: '连接请求免费；注意每周邀请上限（官方：最大 3 万一度连接；邀请频率社区估计 ~100/周）' };
  }
  const quota = tier ? getTierConfig(tier).inmailMonthly : null;
  const quotaNote = quota === 0 ? '；当前档位无 InMail 额度（官方）' : '';
  return { action: 'inmail', reason: `${degree || '3度+'} 人脉，距离较远`, costNote: `消耗 InMail 额度（官方额度见 linkedin-view 输出）${quotaNote}` };
}
