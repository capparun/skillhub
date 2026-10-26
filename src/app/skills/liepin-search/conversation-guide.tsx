'use client';

import { useState } from 'react';
import styles from './conversation-guide.module.css';

const steps = [
  { title: '检查连接', say: '请检查猎聘工具、Chrome 和登录状态，确认是否可以开始寻访。先不要搜索或收藏。', result: '助手检查连接并找到“找简历”页面；连接失败时说明具体问题。' },
  { title: '给岗位，确认标准', say: '请使用 hunter-liepin-mcp 帮我找人。岗位 JD：【粘贴完整要求】。收藏分组：【填写名称】。本轮最多查看【人数】位详情。请先整理硬门槛、加分项和排除项，与我确认。', result: '助手整理筛选标准，指出要求中的矛盾和缺失信息；确认收藏分组及详情人数。' },
  { title: '先试搜，看画像', say: '标准确认。先探索关键词，配合页面筛选条件试搜，给我看少量列表样本和不匹配案例，先不要批量收藏。', result: '助手填写关键词、设置筛选条、点击搜索，展示样本及各搜索词的效果，等你校准画像。' },
  { title: '确认后，逐页找人', say: '画像和搜索条件确认。请逐页处理这些条件下全部可访问的列表，先初筛，再查看值得核实的详情。符合已确认标准的直接收藏到目标组并核实；边界案例集中让我确认。不联系、不付费解锁，详情人数不超过约定值。', result: '助手处理当前页、打开有价值的简历，收藏并核实合适人选，再点击“下一页”。直到结果末页或达到约定的详情人数上限。' },
  { title: '看进度，调整方向', say: '汇报已处理页数、列表初筛人数、详情评估人数、收藏及归组核实人数。说明主要不匹配原因和未完成范围，先不要改变搜索条件。', result: '助手分别报告各环节数量。需要修改标准时先与你对齐；详情额度用完时询问是否增加，验证或访问限制时暂停。' },
  { title: '拿到重点报告', say: '请交付手机可读的重点报告：统计放顶部，用表格列出推荐人选、匹配理由、待确认问题、收藏状态和简历链接。原始记录单独保存，并说明哪些搜索结果已看完、哪些未完成及原因。', result: '你得到可打开的 HTML 报告和独立原始记录，可从人选链接查看简历。不会把未核实人选写成已确认匹配。' },
  { title: '下次从断点继续', say: '请读取上次任务和已保存的数据，核对最后操作及当前页面，从未完成部分继续。沿用已确认标准和剩余详情额度，不重复收藏；额度不足先告诉我。', result: '助手复用已有资料和任务进度；记录或连接缺失时先说明，不从头重复执行。' },
];

export function ConversationGuide({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState('');
  async function copy(index: number) {
    try { await navigator.clipboard.writeText(steps[index].say); setCopied(index); setError(''); }
    catch { setError('复制失败，请直接选中下方示例文字复制。'); }
  }
  const visibleSteps = compact ? [steps[1], steps[2], steps[3]] : steps;
  return <section id="conversation" className={styles.section}>
    <h2>{compact ? "常用任务，直接这样说" : "从第一句话到拿到结果"}</h2>
    <p className={styles.intro}>直接在 AI 助手里对话，无需手写命令。按顺序使用下面的例子，把【括号】里的内容换成你的任务；等助手完成当前一步，再继续下一步。</p>
    {!compact && <p className={styles.example}>例如寻找伺服控制工程师：提供完整 JD，指定“因时伺服控制”分组，并填写本轮允许查看的详情人数。这里是对话示例，不是实际寻访结果。</p>}
    <ol className={styles.flow}><li>确认岗位要求</li><li>试搜校准画像</li><li>逐页筛选与收藏</li><li>核实并交付报告</li></ol>
    <ol className={styles.list}>{visibleSteps.map((step, visibleIndex) => <li key={step.title}>
      <div className={styles.heading}><h3><span>{String(visibleIndex + 1).padStart(2, '0')}</span>{step.title}</h3><button onClick={() => copy(steps.indexOf(step))} aria-label={`复制：${step.title}`}>{copied === steps.indexOf(step) ? '已复制' : '复制示例'}</button></div>
      <div className={styles.content}><div><span className={styles.label}>你可以这样说</span><p className={styles.say}>{step.say}</p></div><div><span className={styles.label}>接下来会发生什么</span><p>{step.result}</p></div></div>
    </li>)}</ol>
    {compact && <a className={styles.more} href="/skills/liepin-search/manual#conversation">查看完整对话流程、进度查询与断点续作 →</a>}
    <p role="status" className={styles.status}>{error || (copied !== null ? `已复制“${steps[copied].title}”示例，请粘贴到 AI 助手。` : '')}</p>
  </section>;
}
