'use client';

import { useEffect, useState } from 'react';
import { commandExamples, exampleGroups, usageExamples, type ExampleGroup } from './examples';
import styles from './landing.module.css';

type Group = ExampleGroup | '常用任务';
const common = ['linkedin', 'name', 'jbf'];
export function UsageExamples() {
  const [group, setGroup] = useState<Group>('常用任务');
  const [view, setView] = useState<'prompts' | 'commands'>('prompts');
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const sync = () => setView(window.location.hash === '#commands' ? 'commands' : 'prompts');
    const frame = requestAnimationFrame(sync);
    window.addEventListener('hashchange', sync);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', sync); };
  }, []);
  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setError(false); }
    catch { setError(true); }
  }
  const visible = group === '常用任务'
    ? common.map(id => usageExamples.find(item => item.id === id)!)
    : usageExamples.filter(item => group === '全部' || item.group === group);
  return <section id="usage-examples" className={styles.examples} aria-labelledby="usage-heading">
    <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>使用指南</p><h2 id="usage-heading">你想做什么？</h2></div><p>选一个任务，复制问法给 AI 助手。</p></header>
    <nav id="commands" className={styles.viewSwitch} aria-label="问法与命令"><a href="#usage-examples" aria-current={view === 'prompts' ? 'page' : undefined}>示例问法 <span>18</span></a><a href="#commands" aria-current={view === 'commands' ? 'page' : undefined}>命令参考 <span>15</span></a></nav>
    {view === 'prompts' ? <div>
      <nav className={styles.filters} aria-label="按使用场景筛选">{(['常用任务', ...exampleGroups.filter(g => g !== '全部'), '全部'] as Group[]).map(value => <button key={value} aria-pressed={group === value} onClick={() => { setGroup(value); setOpenId(null); }}>{value}</button>)}</nav>
      <p className={styles.usageHint}>替换问法中的【资料】后，发给已安装 Skill 的助手。<a href="#installation">尚未安装？先完成安装与连接</a></p>
      <div className={styles.taskList}>{visible.map(item => <article key={item.id} className={styles.taskRow}>
        <div className={styles.taskTop}><div className={styles.taskTitle}><h3><button aria-expanded={openId === item.id} aria-controls={`prompt-${item.id}`} onClick={() => setOpenId(openId === item.id ? null : item.id)}><span>{item.title}</span><span aria-hidden="true" className={styles.chevron}>{openId === item.id ? '−' : '+'}</span></button></h3><p>{item.output}</p></div><button className={styles.rowCopy} aria-label={`复制“${item.title}”问法`} onClick={() => copy(item.id, item.prompt)}>{copied === item.id ? '已复制 ✓' : '复制问法'}</button></div>
        <div id={`prompt-${item.id}`} hidden={openId !== item.id} className={styles.taskBody}><dl><div><dt>你提供</dt><dd>{item.input}</dd></div><div><dt>你得到</dt><dd>{item.output}</dd></div></dl><p className={styles.promptLabel}>发送给 AI 助手的完整问法</p><p className={styles.examplePrompt}>{item.prompt}</p>{item.group === '授权维护' && <p className={styles.taskNote}>先查看预演结果，再批准本次具体操作。结果不确定时停止，先核对记录。</p>}</div>
      </article>)}</div>
      <p className={styles.caption} role="status">{group === '常用任务' ? '先从这 3 个常用任务开始，其他用法可按分类查看。' : `当前显示 ${visible.length} 个示例`}</p>
      <details className={styles.readingNote}><summary>使用前需要了解的边界</summary><p>这些都是问法示例，不代表已查询或保存过真实候选人。先确认自己的谷露租户、对象、人数和范围。查重线索需要人工确认身份，未命中不代表全库不存在。</p><p>当前不提供手机号查重、PDF 内容读取、任意长文本备注、自动发消息或自动创建缺失职位。遮蔽联系方式不能当作空值；其他顾问归属、活跃项目或状态未知时，不默认允许触达。</p></details>
    </div> : <div className={styles.commandPanel}>
      <p className={styles.usageHint}>进阶用户可按需展开命令。普通用户使用“示例问法”即可。</p>
      <details className={styles.readingNote}><summary>命令准备、占位符与写入确认</summary><p>Windows PowerShell 与 macOS / Linux 终端均采用单行写法。先运行 <code>opencli gllue 命令名 --help</code> 核对当前版本；ID、NOTE_LABEL、文件名均需替换。JSON 必须符合相应结构，由助手按 Skill 说明准备，不是任意简历文件或批量数组。</p><p>命令使用本次确认的租户配置。全局 opencli 不可用时，从安装回执定位持久运行时入口，不猜路径或重复安装。带 --confirm 的行仅限精确预览已获批后单独执行，approval.json 必须绑定对象、租户、内容哈希和有效期；uncertain 时停止，不重跑。</p><p>复制按钮只复制只读或预演命令。快捷备注只能选租户配置选项。批量检查点与 HTML 报告由 Skill 编排随包脚本，没有单独的 opencli gllue report 命令。</p></details>
      <div className={styles.commandList}>{commandExamples.map(item => <details key={item.name} className={styles.commandEntry} name="gllue-command"><summary><code>{item.name}</code><span>{item.purpose}</span></summary><div><pre>{item.code}</pre><button className={styles.rowCopy} onClick={() => copy(`command-${item.name}`, item.code.split('\n').filter(line => !line.includes('--confirm')).join('\n'))}>{copied === `command-${item.name}` ? '已复制 ✓' : item.code.includes('--confirm') ? `复制 ${item.name} 预演` : `复制 ${item.name} 示例`}</button></div></details>)}</div>
    </div>}
    <p role="status" aria-live="polite" className={styles.copyStatus}>{copied ? '内容已复制，可粘贴给 AI 助手。' : ''}</p>{error && <p role="alert" className={styles.error}>复制失败，请展开内容后手动选中文字复制。</p>}
  </section>;
}
