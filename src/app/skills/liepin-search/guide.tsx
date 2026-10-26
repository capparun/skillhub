'use client';
import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import { isLiepinMcpRelease, liepinMcpGuide } from '@/lib/liepin-guide';
import { freeCliCommand, windowsCliCommand } from '@/lib/prompts';
import { releaseLabel, type ReleaseState } from '@/lib/product-release';
import { LegacyLiepinInstallGuide } from './legacy-guide';
import styles from './quick-guide.module.css';
import { ConversationGuide } from './conversation-guide';

type Props = { release: { version: string; sha256: string } | null; releaseState: ReleaseState; appUrl: string };
const agents = ['WorkBuddy', 'Codex', 'Claude Code', '其他 MCP 助手'];
export function LiepinInstallGuide(props: Props) {
  if (props.release && !isLiepinMcpRelease(props.release.version)) return <LegacyLiepinInstallGuide {...props} />;
  return <QuickGuide {...props} />;
}
function QuickGuide({ release, releaseState, appUrl }: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState<'mac' | 'windows'>('mac');
  const [agent, setAgent] = useState('WorkBuddy');
  const [task, setTask] = useState('source');
  useEffect(() => { if (/Windows/i.test(navigator.userAgent)) setPlatform('windows'); }, []);
  const ready = releaseState === 'ready' && !!release;
  const command = (platform === 'windows' ? windowsCliCommand : freeCliCommand)({appUrl, productSlug:'liepin-search'});
  const guide = liepinMcpGuide({version:release?.version ?? '', sha256:release?.sha256 ?? '', command, platform, keyword:'', city:''});
  const target = `我使用 ${agent}，系统是 ${platform === 'windows' ? 'Windows' : 'macOS'}。请先确认此助手实际支持的本地 Skill 目录与 MCP 配置方式，不猜路径、不覆盖其他配置。`;
  const sourcing = '请使用 hunter-liepin-mcp 帮我寻找合适人选。岗位 JD：[粘贴完整要求]。收藏目标组：[填写分组]。本次允许查看详情人数：[填写人数]。先对齐硬门槛与优先条件，探索关键词，使用页面筛选条设置条件，少量试搜并让我确认画像。确认后逐页处理该条件下的全部可访问列表，先评估列表，再查看值得核实的详情；按已确认标准收藏合适人选并核实归组。详情人数到限先汇报，验证码或访问限制时停止。不联系、不付费解锁。最后给我手机可读的重点报告：顶部统计、推荐理由、待确认项和简历链接；原始记录另存文件。';
  const taskPrompt = task === 'source' ? sourcing : task === 'resume' ? '请使用 hunter-liepin-mcp 继续已有任务：【任务名称或记录路径】。先读取已有结果，核对当前页面与最后操作，从断点继续。沿用已确认标准和剩余详情额度，不重复收藏；额度不足先汇报。' : '请使用 hunter-liepin-mcp 核实已有任务：【任务名称或记录路径】中的人选是否在收藏分组：【分组名称】。不新增或取消收藏，不访问新的简历。根据已保存数据生成手机可读的重点报告，保留简历链接，原始记录单独保存。';
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label="猎聘页面导航"><strong>猎策 · 猎聘</strong><a href="#installation">快速上手</a><a href="/skills/liepin-search/manual">使用说明与命令 →</a></nav>
    <header className={styles.hero}><span className={styles.badge}>{releaseLabel(releaseState, release)}</span><h1>把岗位交给 AI，<br/>找到合适的人。</h1><p>在猎聘筛选简历、核实经历，把合适人选加入指定收藏分组，交付一份有重点的寻访报告。</p><a className={styles.primary} href="#installation">开始安装 ↓</a><a className={styles.textLink} href="#start">已安装，开始找人 →</a></header>
    <section id="installation"><h2>三步开始使用</h2><p className={styles.muted}>准备好 Chrome、猎聘猎头端账号，以及能执行本地命令并接入 MCP 的 AI 助手。</p>
      <div className={styles.selectors}><label>电脑系统<select value={platform} onChange={e=>setPlatform(e.target.value as 'mac'|'windows')}><option value="mac">macOS</option><option value="windows">Windows</option></select></label><label>AI 助手<select value={agent} onChange={e=>setAgent(e.target.value)}>{agents.map(a=><option key={a}>{a}</option>)}</select></label></div>
      <p className={styles.note}>选择后，复制的指令会自动带上系统和助手名称。请粘贴到对应助手的新对话中执行。</p>
      <article className={styles.step}><span className={styles.number}>01</span><div><h3>安装到 {agent}</h3><p>复制指令给助手，检查环境并完成下载、校验与本地安装。</p>{ready ? <><Copy text={`${target}\n${guide.environment}\n${guide.install}`} label="复制安装指令"/><details><summary>手动安装、下载与校验</summary><p>先确认 Node.js 22+、npm 和 Chrome 可用。手动安装前请确定目标助手的 Skill 目录，并将 HUNTER_SKILLS_DIR 传给本次安装进程；不确定时使用上方的 AI 安装指令。</p><Copy text={command} label="复制终端命令"/><a href={`${appUrl}/api/products/liepin-search/download`}>下载 v{release.version} 安装包</a><p className={styles.code}>安装包 SHA-256：{release.sha256}</p></details></> : <p role="alert">暂时没有可用的发布信息。<button className={styles.secondary} onClick={()=>router.refresh()}>重新获取版本</button></p>}<p className={styles.note}>通过标志：本地 doctor 通过，助手能找到 hunter-liepin-mcp Skill，并保存安装回执。</p></div></article>
      <article className={styles.step}><span className={styles.number}>02</span><div><h3>连接 Chrome 和猎聘</h3><p>按安装回执加载 <strong>HL MCP</strong> 扩展，接入所选助手。在 Chrome <a href="https://h.liepin.com" target="_blank" rel="noreferrer">打开猎聘猎头端 ↗</a>，登录后进入“找简历”。</p><Copy text={`${target}\n${guide.connect}`} label="复制连接检查指令"/><p className={styles.note}>通过标志：助手发现猎聘工具，读到正确的猎聘标签并绑定。此步骤不会搜索或收藏。</p></div></article>
      <article id="start" className={styles.step}><span className={styles.number}>03</span><div><h3>提供要求，开始任务</h3><p>选择任务，填写岗位要求、收藏分组和详情人数。先确认画像与执行范围，再开始寻访。</p><div className={styles.selectors}><label>这次想做什么<select value={task} onChange={e => setTask(e.target.value)}><option value="source">按岗位寻找候选人</option><option value="resume">继续已有寻访任务</option><option value="report">核实收藏并生成报告</option></select></label></div><Copy text={taskPrompt} label="复制任务模板"/><p className={styles.note}>结果：重点人选、收藏核验、待沟通问题、简历链接和独立原始记录。</p></div></article>
    </section>
    <ConversationGuide compact />
    <section className={styles.docs}><h2>安装和使用遇到问题</h2><details><summary>装好了，助手却找不到技能或工具</summary><p>Skill 与 MCP 要分别接入。让助手根据安装回执核对 Skill 目录、MCP 启动配置，再刷新工具或新开会话。不要直接重装。</p></details><details><summary>浏览器没连上、登录失效或出现白屏</summary><p>先检查 Chrome 和 HL MCP 状态，再核对实际标签。登录或验证码由账号本人处理；白屏、限制或操作结果不明时停止，保存错误，不重复提交。</p></details><details><summary>如何更新？哪些环境已验证？</summary><p>更新时重新使用本页安装指令，核对回执与当前版本。macOS 已有安装与猎聘业务验收；Windows 已有正式下载、安装、诊断、连接和合成页面测试。Windows 真实猎聘业务及各 Agent 的首次任务需分别验收。</p></details></section>
  </main>;
}
function Copy({text,label,compact=false}:{text:string;label:string;compact?:boolean}) {
  const [status,setStatus]=useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  async function copyText() {
    try { await navigator.clipboard.writeText(text); setStatus('已复制'); }
    catch { setStatus('复制失败，请选中文字手动复制'); }
  }
  useEffect(()=>setStatus(''),[text]);
  return <div className={compact ? styles.compactCopy : styles.copy}>
    <button className={compact ? styles.copyButton : styles.primary} onClick={copyText}>{label}</button>
    <span role="status">{status}</span>
    {!compact && <>
      <button className={styles.viewCommand} onClick={() => dialog.current?.showModal()}>查看完整指令</button>
      <dialog ref={dialog} className={styles.commandDialog} aria-labelledby={titleId} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
      }}>
        <header className={styles.dialogHeader}><div><h2 id={titleId}>{label.replace(/^复制/, '')}</h2><p>复制后粘贴到 AI 助手；终端命令请在对应终端执行。</p></div><button autoFocus className={styles.dialogClose} aria-label="关闭完整指令" onClick={() => dialog.current?.close()}>×</button></header>
        <pre className={styles.dialogCode} tabIndex={0}>{text}</pre>
        <footer className={styles.dialogFooter}><span role="status">{status || '完整内容，可选中复制'}</span><button className={styles.primary} onClick={copyText}>复制全部内容</button></footer>
      </dialog>
    </>}
  </div>;
}
