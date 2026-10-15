'use client';

import { useState } from 'react';
import styles from './guide.module.css';

const examples = [
  { id: 'search', group: '搜索与筛选', title: '按岗位要求找人', input: '岗位 JD、必要条件、城市和本次读取人数', output: '搜索方案、实际候选人列表和待核实项', prompt: '使用猎聘搜索 Skill，按这个岗位找人：【粘贴 JD】。城市：【城市或不限】，本次先读取首页最多5人。先整理硬性条件、加分项和待确认项，展示搜索方案；我确认后执行一次搜索。不补造条件，不自动翻页或联系候选人。保存实际结果与来源。' },
  { id: 'detail', group: '详情与报告', title: '查看列表里多位候选人的详情', input: '已有任务、候选人标识或名单、读取人数', output: '逐人可见详情、来源对应关系和未读到的内容', prompt: '继续刚才的猎聘任务，读取已保存列表中的这些人：【候选人标识或名单】，最多【人数】人。复用已有详情，缺少时再打开对应页面。逐人保存账号可见的详情，核对与列表身份一致；说明折叠、附件和权限限制导致的缺失。不要把部分内容说成完整简历，不联系、不索要附件或解锁。' },
  { id: 'report', group: '详情与报告', title: '整理候选人比较报告', input: '已有任务、确认过的岗位要求、报告保存目录', output: '比较表、岗位相关证据、待核实项和本地报告', prompt: '根据当前猎聘任务和已确认的岗位要求，整理候选人比较报告。逐项引用已保存的技能、经历和职责证据，区分已支持、不符合和未知；缺失信息不直接判为不符合。导出 HTML、Markdown、CSV 和 JSON 到【本地目录】，告诉我文件路径。只使用已有资料，不追加搜索；最终人选由我复核，不上传或分享候选人资料。' },
  { id: 'connect', group: '连接与排错', title: '检查是否已经连上猎聘', input: '已安装的 Skill；Chrome 中已登录的猎聘找简历页', output: '本地检查结果、绑定页面和具体故障位置', prompt: '请检查猎聘搜索的安装与连接。使用安装回执中的运行时和 doctor，确认 hunter-liepin-search Skill 与 liepin 插件可用。我已在 Chrome 登录猎聘并打开找简历，请连接并核对页面。只检查连接，不搜索、不修改筛选；连接成功与业务验收分开报告，不反复重装或切换扩展。' },
  { id: 'existing', group: '搜索与筛选', title: '读取我已经打开的搜索结果', input: '当前结果页、读取人数', output: '当前页的实际列表、条数和来源', prompt: '复用我当前打开的猎聘结果页，读取最多【人数】条并保存到当前任务。不要重新搜索、清空条件或翻页。报告实际读取数量和页面总数原文，二者分开说明；没有稳定身份的记录不要仅凭姓名合并。' },
  { id: 'revise', group: '搜索与筛选', title: '根据试搜结果调整条件', input: '已有试搜任务、希望调整的条件', output: '试搜复核、修改建议和待确认的新轮次', prompt: '复核当前猎聘任务的试搜结果：哪些岗位条件有证据、哪些仍待核实，详情是否足够？我想调整【具体条件】。先说明与原方案的差异，保留原轮次和结果，给出下一轮方案；我确认后再搜索，不自动放宽其他条件。' },
  { id: 'shortlist', group: '详情与报告', title: '先初选，再复核短名单', input: '已有结果、岗位要求、本人确认的初选范围', output: '初选与复核记录、名单变化原因和证据缺口', prompt: '基于当前任务生成供我审核的初选比较，按岗位相关技能与经历列出理由和证据缺口。我确认初选范围后，复用详情或在我授权范围内补读，再整理复核名单与变化原因。没有读详情的人明确标记仅列表依据。允许名单为空，不凑人数；最终选择由我决定。' },
  { id: 'saved', group: '方案与收藏', title: '保存或复用搜索方案', input: '方案名称，以及保存、读取、应用或删除的具体动作', output: '方案核对结果与本次操作回读', prompt: '请先列出猎聘已有搜索方案。我希望【保存当前条件为／应用／删除】方案【名称】。先核对方案身份和具体条件；涉及保存、应用或删除时，按我已明确的操作范围执行并回读结果。不要批量删除其他方案，也不要额外提交搜索。' },
  { id: 'favorites', group: '方案与收藏', title: '查看或管理候选人收藏', input: '查看收藏列表，或明确的候选人与添加／取消动作', output: '收藏列表，或指定人选的收藏状态回读', prompt: '请先读取当前猎聘收藏列表最多【人数】条并保存结果。如果我需要添加或取消收藏，会明确给出候选人和动作；按授权逐人核对身份，操作后回读状态，不改动其他收藏。本地任务标签与平台收藏分别说明。' },
  { id: 'cleanup', group: '任务收尾', title: '保存报告后，关闭本任务的详情标签', input: '已完成的任务和已保存的报告', output: '详情、搜索标签及保存组的清理结果与保留原因', prompt: '当前猎聘任务完成了。先确认报告和详情已保存，再清理明确属于本任务的详情标签；用户原有页面、其他任务页面和来源不明的页面保留。分别汇报详情标签、搜索标签、保存组的处理情况。需要浏览器界面收尾或删除确认时明确说明，不按域名或组名批量关闭，也不重新打开简历。' },
  { id: 'error', group: '连接与排错', title: '操作中断了，怎样继续？', input: '当前任务和脱敏后的错误信息', output: '失败位置、已有结果与可继续的下一步', prompt: '猎聘任务在这里中断：【脱敏报错】。先读取任务记录与已保存结果，核对上一步是否已经生效。结果不明确时保留现场，不重复搜索或点击。不清空历史，不反复重装；告诉我已完成什么、卡在哪里、下一步怎样继续。不要索取账号密码或令牌。' },
];
const groups = ['常用任务', '搜索与筛选', '详情与报告', '方案与收藏', '任务收尾', '连接与排错', '全部'];

export function LiepinUsageExamples() {
  const [group, setGroup] = useState('常用任务');
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState(false);
  const visible = group === '常用任务' ? examples.slice(0, 3) : examples.filter(item => group === '全部' || item.group === group);
  async function copy(id: string, prompt: string) {
    try { await navigator.clipboard.writeText(prompt); setCopied(id); setError(false); }
    catch { setCopied(''); setError(true); }
  }
  return <section id="usage-examples" className={styles.usage} aria-labelledby="usage-heading">
    <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>安装好了，接下来怎么用</p><h2 id="usage-heading">你想做什么？</h2></div><p>选一个任务，复制问法给 AI 助手。</p></header>
    <ol className={styles.usageFlow} aria-label="猎聘寻访流程"><li>提供岗位要求</li><li>确认方案与搜索</li><li>读取详情与复核</li><li>保存报告与收尾</li></ol>
    <nav className={styles.usageFilters} aria-label="按使用场景筛选">{groups.map(value => <button key={value} aria-pressed={group === value} onClick={() => { setGroup(value); setOpen(null); setCopied(''); setError(false); }}>{value}</button>)}</nav>
    <p className={styles.usageHint}>替换【括号里的内容】，发给已安装猎聘 Skill 的助手。<a href="#installation">尚未安装？先完成安装与连接 →</a></p>
    <div>{visible.map(item => <article key={item.id} className={styles.usageRow}><div className={styles.usageTop}><div><h3><button aria-expanded={open === item.id} aria-controls={`usage-${item.id}`} onClick={() => setOpen(open === item.id ? null : item.id)}>{item.title}<span aria-hidden="true">{open === item.id ? '−' : '+'}</span></button></h3><p>{item.output}</p></div><button className={styles.secondary} aria-label={`复制“${item.title}”问法`} onClick={() => copy(item.id, item.prompt)}>{copied === item.id ? '已复制 ✓' : '复制问法'}</button></div><div id={`usage-${item.id}`} hidden={open !== item.id} className={styles.usageBody}><dl><dt>你提供</dt><dd>{item.input}</dd><dt>你得到</dt><dd>{item.output}</dd></dl><p className={styles.eyebrow}>发给 AI 助手的完整问法</p><p className={styles.usagePrompt}>{item.prompt}</p></div></article>)}</div>
    <p className={styles.usageHint}>{group === '常用任务' ? '先从这 3 个常用任务开始，其他用法可按分类查看。' : `当前显示 ${visible.length} 个示例`}</p>
    <p role="status" aria-live="polite">{copied ? '问法已复制，可粘贴给 AI 助手。' : ''}</p>{error && <p role="alert" className={styles.error}>复制失败，请展开问法后手动选择文字复制。</p>}
    <details className={styles.details}><summary>使用前需要了解的边界</summary><p>这些是使用示例，不是真实候选人结果。详情仅覆盖账号可见内容，折叠、附件和权限限制可能造成缺失；最终人选由你复核。不自动发送消息、索要附件或付费解锁。收藏与方案变更按明确范围执行，结果不明先核对。</p><p>报告保存在本地，不默认上传或分享。任务清理需使用包含该能力的 v0.2.3 或更新版本；保存组可能需要在 Chrome 界面确认收尾。</p></details>
  </section>;
}
