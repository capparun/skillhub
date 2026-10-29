'use client';
import {useSyncExternalStore,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {freeCliCommand,windowsCliCommand} from '@/lib/prompts';
import {releaseLabel,type ReleaseState} from '@/lib/product-release';
import {useId} from 'react';
import styles from './quick-guide.module.css';
function Copy({text,label}:{text:string;label:string}) {
 const [copied,setCopied]=useState<string|null>(null);
 const id=useId();
 async function copy(){try{await navigator.clipboard.writeText(text);setCopied(text);}catch{setCopied(null);}}
 return <div className={styles.inlineCopy}><button type="button" onClick={copy}>{label}</button><span role="status">{copied===text?'已复制':''}</span><details><summary>展开指令</summary><pre id={id}>{text}</pre><p>复制失败时，可选中上方全文手动复制。</p></details></div>;
}
type Props={release:{version:string;sha256:string}|null;releaseState:ReleaseState;appUrl:string};
const subscribePlatform=()=>()=>{};
const detectPlatform=(): 'mac'|'windows'=>/Windows/i.test(navigator.userAgent)?'windows':'mac';
const serverPlatform=(): 'mac'|'windows'=>'mac';
const agents=['WorkBuddy','Codex','Claude Code','其他本地 AI 助手'];
const tasks={
  people:'请使用 LinkedIn Skill 找人。岗位或目标角色：[填写]；地区：[填写]；硬性条件：[填写]；优先条件：[填写]；目标人数：[填写]。先确认当前 Chrome Profile、LinkedIn 账号及可用权限，再与我确认筛选方案和本次执行范围。每轮记录条件、结果总数与已读数量，按数量决定是否调整条件或继续翻页。评估已采集的人选，缺少证据的标明原因；用表格交付姓名、公司、职位、匹配依据、待确认项和来源链接。不发送消息或邀请。',
  companies:'请使用 LinkedIn Skill 找公司。目标行业或产品：[填写]；公司规模：[填写]；业务地区：[填写]；必须满足的条件及证据要求：[填写]；目标家数：[填写]。先核实账号是否具备 Sales Navigator；没有权限时说明普通 LinkedIn 可做的范围，不假定有高级筛选。和我确认筛选条件与执行范围，记录每轮总数及已读数量，去重并逐家评估。人数估算须标明依据与不确定性。输出公司、业务、规模、地区、符合依据和来源链接的表格。不联系任何人。',
  existing:'请使用 LinkedIn Skill 研究这份已有名单：[粘贴公司或人员链接]。研究目的：[填写]；需要核实的信息：[填写]。复用已有资料，仅补充任务需要的信息。每个对象都给出结论、依据、缺口和来源；无法访问的单独说明，不用“未评估”代替已经能完成的判断。执行范围先与我确认；不发送消息或邀请。'
};
export function LinkedInLanding({release,releaseState,appUrl}:Props){
 const router=useRouter();const [chosenPlatform,setPlatform]=useState<'mac'|'windows'|null>(null);const [agent,setAgent]=useState('WorkBuddy');const [task,setTask]=useState<keyof typeof tasks>('people');const [taskCopied,setTaskCopied]=useState<string|null>(null);
 const detectedPlatform=useSyncExternalStore(subscribePlatform,detectPlatform,serverPlatform);
 const platform=chosenPlatform??detectedPlatform;
 const command=(platform==='windows'?windowsCliCommand:freeCliCommand)({appUrl,productSlug:'soho-sourcing'});
 const target=`我使用 ${agent}，系统是 ${platform==='windows'?'Windows':'macOS'}。`;
 const install=`${target}请安装猎策 LinkedIn 正式版 ${release?.version??''}。先核对 Node.js 22+、npm、Chrome，以及此助手实际支持的本地 Skill 目录和命令执行权限。按安装器支持的目标参数或 HUNTER_SKILLS_DIR 指定正确的 Skill 目录；不要猜路径或覆盖其他插件配置。执行官网命令：\n${command}\n安装包 SHA-256 应为 ${release?.sha256??''}（不是安装脚本的哈希）。完成后执行安装包提供的 doctor，保存安装回执，确认助手可发现 cskh-linkedin 与 cskh-linkedin-salesnav。命令调用优先用回执中的包内 OpenCLI 启动入口，不假定系统 PATH 上的 opencli 就是本包版本。失败时报告阶段与日志，不反复重装。不要自动执行搜索、发送消息或邀请。`;
 const connect=`${target}请读取猎策 LinkedIn 安装回执，使用包内 OpenCLI 检查浏览器连接。浏览器扩展使用 Chrome 商店官方 OpenCLI，不使用猎聘 HL MCP 或开发候选扩展。列出实际连接的 Chrome Profile，识别 LinkedIn 登录账号；多个 Profile 时确认目标账号后绑定。分别核实普通 LinkedIn、Premium、Sales Navigator 的可用能力，不把 Premium 等同于 Sales Navigator，不把未知余额说成零。RPS 尚未实现。优先复用现有标签，不重复打开首页；遇到登录、验证或访问限制时停止并说明。只做连接与账号检查，不搜索、不读取私信、不发送消息或邀请。`;
 const diagnose=`${target}请诊断猎策 LinkedIn 为什么不能使用。依次读取已有安装回执并检查 Skill 目录、包内 CLI 与 doctor，然后检查官方 OpenCLI 扩展连接、目标 Chrome Profile、LinkedIn 登录账号和实际权限。先报告具体卡在哪一步，再给出最小修复步骤；不要反复重装、覆盖其他工具、切换账号或自动升级。不要搜索、读取私信、发送消息或邀请。`;
 const upgrade=`${target}请将已有猎策 LinkedIn 升级到官网正式版 ${release?.version??''}。先读取原安装回执，确认当前版本、安装目录和作用域，保留任务数据及其他工具配置。优先使用原回执对应的更新入口；不能沿用时说明原因，确认原路径后再安装，不另建一套安装。官网地址：${appUrl}/skills/linkedin。目标安装包 SHA-256：${release?.sha256??''}。升级后执行 doctor 和不访问 LinkedIn 的 CLI 检查，核对新回执版本与助手加载路径，分别报告通过和未验证项目。不搜索、不发送。`;
 return <main className={`${styles.page} ${styles.document}`}>
 <nav className={styles.nav} aria-label="LinkedIn 页面导航"><strong>猎策 · LinkedIn</strong><a href="/skills/linkedin/manual">完整使用手册 →</a></nav>
 <header className={styles.hero}><span className={styles.badge}>{releaseLabel(releaseState,release)}</span><h1>LinkedIn 安装与上手</h1><p>本文说明 LinkedIn Skill 的安装、诊断、首次使用和升级方法。首次使用请从第 1 节开始。</p></header>
 <nav className={styles.taskNav} aria-label="本文目录"><strong>目录</strong><ol>{[['installation','安装与连接'],['start','快速上手'],['diagnostics','检查与排错'],['upgrade','升级版本']].map(([id,title])=><li key={id}><a href={`#${id}`}>{title}</a></li>)}</ol></nav>
 <section id="installation" className={styles.docs}><span id="install-center"/><h2>1. 安装与连接</h2><p>准备好 Chrome 和 LinkedIn 账号。依次完成安装、连接；遇到问题请查看第 3 节的诊断方法。</p>
 <div id="environment" className={styles.environment}><h3>1.1 选择系统和 AI 助手</h3><div className={styles.selectors}><label>电脑系统<select value={platform} onChange={e=>setPlatform(e.target.value as 'mac'|'windows')}><option value="mac">macOS</option><option value="windows">Windows</option></select></label><label>AI 助手<select value={agent} onChange={e=>setAgent(e.target.value)}>{agents.map(a=><option key={a}>{a}</option>)}</select></label></div><p className={styles.note}>下面的安装、检查和升级指令会随选择更新。复制后，粘贴到 {agent} 的对话框。</p></div>
 <article className={styles.step}><div><h3>1.2 安装 Skill</h3><p>复制安装指令，粘贴到所选 AI 助手的新对话中执行。助手将检查环境、下载官方安装包并完成安装。</p>{releaseState==='ready'&&release?<><p className={styles.context}>当前环境：{platform==='windows'?'Windows':'macOS'} · {agent}</p><Copy text={install} label="复制安装指令"/><details><summary>手动安装、下载与校验</summary><p>需要 Node.js 22+、npm 和 Chrome。先确认目标助手的 Skill 目录和安装作用域；不确定时使用上方 AI 安装指令。</p><Copy text={command} label="复制终端命令"/><a href={`${appUrl}/api/products/soho-sourcing/download`}>下载 v{release.version} 安装包</a><p className={styles.code}>安装包 SHA-256：{release.sha256}</p></details></>:<p role="alert">暂时无法获取可安装的公开版本。<button className={styles.secondary} onClick={()=>router.refresh()}>重新获取版本</button><Link href="/">查看产品与访问权限</Link></p>}<p className={styles.note}>完成标志：助手确认技能已安装，并告诉你安装位置。接着完成下面的浏览器连接。</p></div></article>
 <article className={styles.step}><div><h3>1.3 连接浏览器和账号</h3><p>在要使用的 Chrome 用户配置中安装 <a href="https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk" target="_blank" rel="noreferrer">官方 OpenCLI 扩展 ↗</a>，按扩展提示连接。打开 <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">LinkedIn ↗</a> 并登录目标账号。</p><Copy text={connect} label="复制连接检查指令"/><p className={styles.note}>完成标志：助手说出正确的 LinkedIn 账号和可用功能。确认无误后，前往「快速上手」。</p></div></article>

 <a className={styles.textLink} href="#start">已安装并连接，开始第一个任务 →</a></section>
 <section id="start" className={styles.docs}><span id="usage-examples"/><h2>2. 快速上手</h2><p>确认连接正常后，选一个任务。复制模板，把方括号里的内容换成你的要求，再发给 {agent}。</p><div className={styles.selectors}><label>这次想做什么<select value={task} onChange={e=>setTask(e.target.value as keyof typeof tasks)}><option value="people">找候选人 / 公司负责人</option><option value="companies">按条件找公司</option><option value="existing">研究已有名单</option></select></label></div><p className={styles.taskHint}>{task==='people'?'准备：岗位 JD 或目标角色、地区和目标人数。':task==='companies'?'准备：行业、规模、地区和目标公司数量。':'准备：公司或人员链接，以及要核实的信息。'}</p><pre className={styles.taskTemplate}>{tasks[task]}</pre><button className={styles.copyButton} onClick={async()=>{try{await navigator.clipboard.writeText(tasks[task]);setTaskCopied(tasks[task]);}catch{setTaskCopied(null);}}}>复制任务模板</button><span role="status">{taskCopied===tasks[task]?' 已复制':''}</span><div className={styles.outcome}><h3>执行流程与结果</h3><ol><li>助手确认要求、筛选条件和搜索范围。</li><li>你确认后，助手开始搜索和评估。</li><li>返回表格名单，包含判断理由和来源链接。</li></ol>{task==='people'&&<span>找人默认目标是至少 200 位去重人员的列表资料，执行范围先确认；结果不足时说明原因。不会默认逐人读取 200 份详情，也不会自动发消息或邀请。</span>}</div></section>
 <section id="diagnostics" className={styles.docs}><h2>3. 检查与排错</h2><p>不用先判断哪里坏了。把检查指令交给 {agent}，它会依次检查安装、浏览器连接和账号权限，告诉你卡在哪一步。</p><p className={styles.context}>当前环境：{platform==='windows'?'Windows':'macOS'} · {agent}　<a href="#environment">修改环境</a></p><Copy text={diagnose} label="复制诊断指令"/>
 <dl className={styles.problemList}>{[['助手找不到 Skill 或命令','核对安装目录，刷新技能或新开对话；先不要重装。'],['Chrome 开着，却找不到账号','检查登录该账号的 Chrome 用户配置中，官方 OpenCLI 扩展是否已连接。'],['没有高级搜索或公司筛选','先确认 Sales Navigator 权限。Premium 不等于 Sales Navigator；RPS 暂不支持。'],['下载或升级失败','把完整错误交给助手，区分网络、证书与安装问题；不要关闭证书验证。']].map(([title,body])=><div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl><p className={styles.note}>检查成功后，应能确认：安装可用、浏览器已连接、账号正确。检查本身不会搜索或发送消息。</p></section>
 <section id="upgrade" className={styles.docs}><h2>4. 升级版本</h2><p>已经安装过？沿用原安装目录更新，不需要重新走一遍首次安装。</p>{releaseState==='ready'&&release?<><p>当前正式版：<strong>v{release.version}</strong></p><p className={styles.context}>当前环境：{platform==='windows'?'Windows':'macOS'} · {agent}　<a href="#environment">修改环境</a></p><Copy text={upgrade} label="复制升级指令"/></>:<p>暂时无法获取正式版本，请稍后重试，或先运行上面的诊断。</p>}<p className={styles.note}>完成标志：助手确认版本已更新、诊断通过、原来的任务数据仍在。若助手仍加载旧技能，刷新技能或新开对话。</p><p className={styles.note}>安装检查通过不代表账号所有功能均可用；实际可用范围以连接检查结果为准。</p></section>
 <footer className={styles.docs}><a className={styles.textLink} href="/skills/linkedin/manual">查看完整使用手册、账号能力和 CLI 命令 →</a></footer>
 </main>;
}
