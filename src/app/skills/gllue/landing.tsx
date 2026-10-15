'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { freeCliCommand, windowsCliCommand } from '@/lib/prompts';
import styles from './landing.module.css';
import { ProductSectionNav } from '../../components/product-section-nav';
import { UsageExamples } from './usage-examples';

type Release = { product: { slug: string; isPublic: boolean }; version: string; sha256: string; downloadUrl: string };
const connectionPrompt = `请使用 cskh-gllue Skill 检查谷露连接，先阅读已安装的 SKILL.md。
1. 向我确认本次使用的谷露租户和完整 HTTPS 域名，不使用示例租户，不索取密码。
2. 在本次命令环境中设置 GLLUE_TENANT 和 GLLUE_DOMAIN（Windows 用 PowerShell 环境变量）；不修改全局环境。需要跨会话保存时，将非敏感租户配置保存到我确认的本地私有文件，后续命令显式使用 GLLUE_CONFIG。
3. 确认 Chrome 中 OpenCLI 官方扩展已启用，由我手动登录该租户。
4. 运行 opencli doctor 和 opencli gllue capability-probe -f json，核对实际租户及只读能力。
只检查连接，不搜索、不读取候选人、不写入、不触达。遇到登录异常、验证码或访问限制就停止，保留脱敏错误。若全局 opencli 不可用，定位安装回执内持久运行时的 OpenCLI JS 入口，通过 node 调用；不要猜路径或重复安装。`;
const duplicatePrompt = `请使用 cskh-gllue，检查我接下来提供的 LinkedIn 候选人是否已在谷露中。
先确认目标租户、输入资料和搜索范围，用 check-exists 只读查重。姓名、邮箱或 LinkedIn 主页链接作为线索，公司和职位辅助判断。
展示命中记录、匹配理由与待核实项，身份由我确认。未命中仅表示本轮范围未找到；手机号查重不在当前能力范围。
本次不新增、不更新、不关联职位、不发送任何消息。`;

export function GllueLanding() {
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState(false);
  const [os, setOs] = useState<'windows' | 'mac'>('windows');
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      setOrigin(window.location.origin);
      if (/mac/i.test(navigator.userAgent)) setOs('mac');
    });
    api<Release>('/api/releases/latest?product=gllue-only').then(data => {
      if (data.product?.slug !== 'gllue-only' || !data.product.isPublic || !data.version || !/^[a-f0-9]{64}$/.test(data.sha256) || !data.downloadUrl) throw new Error('Invalid Gllue release');
      if (!cancelled) setRelease(data);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, []);
  const input = { appUrl: origin, productSlug: 'gllue-only' };
  const command = os === 'windows' ? windowsCliCommand(input) : freeCliCommand(input);
  const installPrompt = release && origin ? `请帮我安装猎策 Gllue 人才库 Skill，当前页面发布版本 v${release.version}。
1. 检查 Node.js 22+、npm 和 ${os === 'windows' ? 'Windows PowerShell 5.1+、tar.exe；本安装流程不需要 Bash、WSL 或 Git Bash' : 'macOS 终端、tar 和 curl'}。缺少依赖先报告。
2. 核对我当前 AI 助手的实际 skills 目录与持久状态目录；通过 HUNTER_SKILLS_DIR、HUNTER_STATE_DIR 环境变量明确指定，安装和 doctor 保持一致。不要把 Skill 装到临时解压目录。
3. 向我说明安装位置及同名旧插件情况，确认后执行官方命令：
${command}
4. 脚本从官方 latest API 获取版本并校验 tar.gz 的 SHA-256，安装 cskh-gllue、Gllue 插件与持久运行时，随后运行 doctor。页面版本的安装包 SHA-256：${release.sha256}（不用于校验引导脚本）。若 latest 版本已变化，先报告新版本与哈希。
5. 报告实际安装路径、版本和 doctor 真实输出；检查 15 个 Gllue 命令可加载，当前助手能发现 cskh-gllue。需要时刷新或新开会话。doctor 通过只代表本地组件通过，下一步还需连接自己的谷露租户。
失败即停止并保留完整日志；安装已成功而 doctor 因 EPERM/EBUSY 无法执行时，只在普通终端重跑日志目录 doctor-command.txt 中的检查命令，不要重跑安装。不更改全局 npm registry 或清空缓存。本次只安装，不登录、不查人、不写入。` : '';
  async function copy(id: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(id); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <main className={styles.page}>
    <nav className={styles.topbar} aria-label="页面导航"><strong>猎策 <span>／ Gllue 人才库</span></strong><button onClick={() => copy('share', `${origin}/skills/gllue`)}>{copied === 'share' ? '链接已复制' : '分享此页面 ↗'}</button></nav>
    <ProductSectionNav className={styles.sectionNav} sections={[{ id: 'overview', label: '产品介绍' }, { id: 'installation', label: '安装与连接' }, { id: 'usage-examples', label: '使用示例' }, { id: 'commands', label: '命令参考' }]} />
    <section id="overview" className={styles.hero}>
      <div><p className={styles.eyebrow}>人才库管理 · 谷露 Gllue</p><h1>已有的人，先用好。<br /><em>新找到的人，先查重。</em></h1><p className={styles.intro}>让 AI 助手查询谷露人才库、整理候选人证据，把 LinkedIn 等渠道找到的人与库内记录核对。维护资料前，先看差异，再由你确认。</p><a className={styles.primary} href="#installation">安装 Gllue Skill ↓</a><p><a className={styles.textLink} href="#usage-examples">已装好？查看使用问法与命令 →</a></p><p className={styles.caption}>独立交付 · Windows / macOS / Linux · Node.js 22+</p></div>
      <aside className={styles.flow} aria-label="谷露查重流程"><div className={styles.flowHeading}><span>找到人之后，接着做</span><span aria-hidden="true">谷</span></div><ol><li><span className={styles.number}>01</span><div><strong>提供候选人线索</strong><p>姓名、邮箱或 LinkedIn 个人链接</p></div></li><li><span className={styles.number}>02</span><div><strong>与谷露记录核对</strong><p>查重线索 → 人工确认身份 → 字段差异</p></div></li><li><span className={styles.number}>03</span><div><strong>审核后，再维护资料</strong><p>整批预览 → 逐人逐项授权 → 写后回读</p></div></li></ol><div className={styles.flowFoot}>查重命中需要复核身份；未命中不代表全库不存在。</div></aside>
    </section>
    <section className={styles.value} aria-label="产品能力"><article><span>库内查询</span><h2>先复用人才资产</h2><p>搜索候选人、读取可见简历与联系记录，按确认的职位要求评估并形成本地审核报告。</p></article><article><span>外部回流</span><h2>LinkedIn 人选查重</h2><p>接收外部候选人资料，展示匹配理由与字段差异。不需要安装 LinkedIn Skill 才能单独查重。</p></article><article><span>授权维护</span><h2>每次变更，都可核对</h2><p>新增、单字段更新、快捷备注和职位关联均有确认门。结果不确定时停止，不自动重试。</p></article></section>
    <section className={styles.preparation}><header><p className={styles.eyebrow}>使用前准备</p><h2>独立安装，<br />连接你的谷露。</h2></header><dl><div><dt>电脑</dt><dd>Windows 10 / 11 使用 PowerShell，安装无需 Bash；macOS / Linux 使用终端。均需 Node.js 22+ 和 npm。</dd></div><div><dt>浏览器</dt><dd>Chrome 与 OpenCLI 官方扩展；使用你已有权限的谷露账号，在浏览器中手动登录。</dd></div><div><dt>AI 助手</dt><dd>WorkBuddy、Codex 或 Claude Code，能够访问本地文件与终端。包内只有 Gllue Skill 与插件，不捆绑其他渠道。</dd></div><div><dt>当前版本</dt><dd>{release ? `网站安装包 v${release.version}。` : error ? '暂时无法获取发布版本，请刷新后重试。' : '正在获取发布信息。'} 核心 Skill 与插件 v1.3.0，15 个命令。</dd></div><div><dt>Windows</dt><dd>当前源码已通过 Windows Node 20/22 的插件、Skill、打包与命令注册测试。本站安装包要求 Node 22+。<a href="https://github.com/capparun/hunter-gllue/actions/runs/37217414953" target="_blank" rel="noreferrer">查看源码测试 ↗</a>；<a href="https://github.com/capparun/skillhub/actions/runs/38675148940" target="_blank" rel="noreferrer">查看本站 Windows 安装验收 ↗</a>。客户电脑上的浏览器连接与首次查询仍需实际验证。</dd></div></dl></section>
    <section id="installation" className={styles.installation}><header className={styles.sectionHeading}><div><p className={styles.eyebrow}>从安装到第一次查重</p><h2>每一步，都有完成标志。</h2></div><p>先安装，再连接，最后做小任务。</p></header>
      <article className={styles.step}><span className={styles.stepNumber}>01</span><div className={styles.stepContent}><h3>选择电脑，交给助手安装</h3><p>选择你的系统，复制完整安装话术到当前 AI 助手。</p><div className={styles.promptActions} role="group" aria-label="选择操作系统"><button className={os === 'windows' ? styles.primary : styles.secondary} aria-pressed={os === 'windows'} onClick={() => setOs('windows')}>Windows</button><button className={os === 'mac' ? styles.primary : styles.secondary} aria-pressed={os === 'mac'} onClick={() => setOs('mac')}>macOS / Linux</button></div><div className={styles.promptActions} style={{marginTop:20}}><button className={styles.primary} disabled={!release || !origin} onClick={() => copy('install', installPrompt)}>{copied === 'install' ? '安装话术已复制 ✓' : error ? '发布信息读取失败' : release ? '复制安装话术' : '正在获取版本'}</button>{release && <a className={styles.secondary} href={release.downloadUrl}>下载安装包 v{release.version} ↓</a>}</div><details className={styles.details}><summary>查看完整安装话术与命令</summary><pre>{installPrompt || '取得有效发布信息后显示安装方式。'}</pre></details><span className={styles.check}>完成标志：本地 doctor 通过，当前助手识别 cskh-gllue，15 个命令可加载。</span></div></article>
      <article className={styles.step}><span className={styles.stepNumber}>02</span><div className={styles.stepContent}><h3>确认租户，连接浏览器</h3><p>使用自己的谷露域名与账号。由你在 Chrome 手动登录，助手检查连接和目标租户。</p><button className={styles.secondary} onClick={() => copy('connect', connectionPrompt)}>{copied === 'connect' ? '检查话术已复制 ✓' : '复制连接检查话术'}</button><details className={styles.details}><summary>查看连接检查话术</summary><pre>{connectionPrompt}</pre></details><span className={styles.check}>完成标志：OpenCLI 连接正常，capability-probe 的租户匹配，所需只读能力可用。</span></div></article>
      <article className={styles.step}><span className={styles.stepNumber}>03</span><div className={styles.stepContent}><h3>拿一位 LinkedIn 人选试查重</h3><p>提供一个你有权处理的候选人线索，先做只读查重，核对记录和匹配理由。</p><button className={styles.secondary} onClick={() => copy('duplicate', duplicatePrompt)}>{copied === 'duplicate' ? '查重话术已复制 ✓' : '复制首次查重话术'}</button><details className={styles.details}><summary>查看首次查重话术</summary><pre>{duplicatePrompt}</pre></details><span className={styles.check}>完成标志：得到可复核的查重结果。身份确认、搜索范围与未核实信息清楚列出。</span></div></article>
      {copyError && <p role="alert" className={styles.error}>复制失败，请展开完整话术后手动复制。</p>}<p role="status" aria-live="polite" className={styles.copyStatus}>{copied ? '所选内容已复制，可粘贴到 AI 助手。' : ''}</p>
    </section>
    <UsageExamples />
    <section className={styles.boundary}><h2>查询、判断与写入，各有确认。</h2><p>资料保存在本地任务目录。搜索范围受账号权限限制；默认不读取 PDF、不解锁遮蔽联系方式，不发送邮件、微信或 LinkedIn 消息。真实新增、更新和职位关联需明确授权并回读；手机号查重、完整客户环境验收及部分写入回读仍有边界。</p></section>
    <footer className={styles.footer}><span>© 2026 猎策 · Gllue 人才库</span><span>独立交付 · 本地运行</span></footer>
  </main>;
}
