/**
 * LinkedIn 触达文案模板（只读输出，不自动发送）。
 * 变量占位：{name} 候选人称呼, {title} 职位, {company} 公司, {role} 在招职位, {jd} 职位亮点
 */

export const MESSAGE_TEMPLATES = {
  connect_note: {
    label: '连接请求附言（≤300 字符）',
    template: '{name} 您好，我是专注{title}方向的猎头，正在帮{company}类公司招聘{role}。看到您的背景很匹配，想加您为联系人，方便时聊聊？',
    maxLength: 300,
  },
  inmail: {
    label: 'InMail（首次触达）',
    template: '主题：{role} 机会 — 与您的{title}背景很匹配\n\n{name} 您好，\n\n我目前在招聘{role}，看到您在{company}的经历与职位要求高度匹配。\n\n职位亮点：{jd}\n\n如果您有兴趣了解详情，回复本消息即可；如不方便，也感谢您的时间。',
    maxLength: 2000,
  },
  referral_ask: {
    label: '请共同好友介绍',
    template: '我在关注{company}的 {name}（{title}），看到你们是好友。我有一个{role}机会觉得很适合 TA，方便帮忙引荐一下吗？我可以先把职位简介发你。',
    maxLength: 300,
  },
};

/**
 * 渲染模板。
 * @param {'connect_note'|'inmail'|'referral_ask'} kind
 * @param {Object<string,string>} vars
 * @returns {string}
 */
export function renderTemplate(kind, vars = {}) {
  const def = MESSAGE_TEMPLATES[kind];
  if (!def) throw new Error(`未知模板: ${kind}，可选: ${Object.keys(MESSAGE_TEMPLATES).join(', ')}`);
  return def.template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `[${key}]`);
}

/**
 * 按推荐动作返回应使用的模板 kind。
 */
export function templateForAction(action) {
  switch (action) {
    case 'message': return 'inmail';
    case 'inmail': return 'inmail';
    case 'connect_note': return 'connect_note';
    case 'referral': return 'referral_ask';
    default: return 'connect_note';
  }
}
