'use client';

import { isLiepinMcpRelease, liepinMcpGuide } from '@/lib/liepin-guide';
import { windowsInstallAcceptance } from '@/lib/prompts';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { freeCliCommand, windowsCliCommand } from '@/lib/prompts';
import { releaseLabel, type ReleaseState } from '@/lib/product-release';
import styles from './guide.module.css';
import { ProductSectionNav } from '../../components/product-section-nav';
import { LiepinUsageExamples } from './usage-examples';

const steps = ['准备环境', '安装猎聘', '连接猎聘', '首次搜索'];
type Platform = 'mac' | 'windows';

export function LegacyLiepinInstallGuide({ release, releaseState, appUrl }: {
  release: { version: string; sha256: string } | null;
  releaseState: ReleaseState;
  appUrl: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [platform, setPlatform] = useState<Platform>('mac');
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>([false, false, false, false]);
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (/win/i.test(navigator.userAgent)) setPlatform('windows');
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const ready = releaseState === 'ready' && !!release;
  const mcpRelease = isLiepinMcpRelease(release?.version);
  const versionParts = release?.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const taskRelease = !!versionParts && (Number(versionParts[1]) > 0 || Number(versionParts[2]) >= 2);
  const reportRelease = mcpRelease || !!versionParts && (Number(versionParts[1]) > 0 || Number(versionParts[2]) > 2 || (Number(versionParts[2]) === 2 && Number(versionParts[3]) >= 2));
  const url = `${appUrl}/skills/liepin-search`;
  const commandInput = { appUrl, productSlug: 'liepin-search' };
  const command = platform === 'windows' ? windowsCliCommand(commandInput) : freeCliCommand(commandInput);
  const mcpGuide = liepinMcpGuide({ version: release?.version ?? '', sha256: release?.sha256 ?? '', command, platform, keyword, city });
  const environmentPrompt = mcpRelease ? mcpGuide.environment : taskRelease ? `请准备猎聘搜索环境：检查 Node.js 22+ 和 Chrome。安装包会提供固定 OpenCLI 1.8.8 运行时；不要仅因全局版本不同就修改其他工具。安装后使用回执中的运行时与 doctor 路径，确认实际版本为1.8.8。浏览器使用官方 OpenCLI 扩展，不安装实验副本。` : `请帮我准备猎聘搜索的本地环境。我使用${platform === 'windows' ? 'Windows' : 'macOS'}。\n1. 检查 Node.js，需要 22 或更高版本；如果未安装或版本不足，请指导我从 https://nodejs.org 安装受支持的 LTS 版本。\n2. 检查 opencli --version。已安装且不低于 1.8.8 就保留；缺失时执行 npm install -g @jackwener/opencli@1.8.8，版本过低时先说明升级影响。\n3. 确认 Chrome 可打开，并告诉我实际 Node.js、OpenCLI 版本。任一步失败都停在该步骤，给出具体修复方法。`;
  const installPrompt = ready ? mcpRelease ? mcpGuide.install : `请帮我安装猎聘搜索独立包。我使用${platform === 'windows' ? 'Windows PowerShell' : 'macOS 终端'}，已经准备好 Node.js 22+ 和 OpenCLI。\n\n执行官方安装命令：\n${command}\n\n脚本会下载 liepin-search、校验 SHA-256、安装 liepin 插件与 hunter-liepin-search Skill，并运行本地 doctor。当前页面发布版本 v${release.version}，以下 SHA-256 仅对应 .tar.gz 安装包，不对应 install.ps1：\n${release.sha256}\n\n安装后再运行 opencli liepin --help，确认能看到 prepare、search、results 与 saved-searches。向我报告真实输出和 Skill 安装目录，并检查所用 AI 助手是否能发现 hunter-liepin-search；如需刷新技能或新开会话，请指导我完成。安装或检查失败时不要宣称成功。此步骤只安装，下一步再连接猎聘。${platform === 'windows' ? '\n\n' + windowsInstallAcceptance : ''}` : '';
  const connectPrompt = mcpRelease ? mcpGuide.connect : taskRelease ? `请按已安装的 hunter-liepin-search Skill 核对连接。先使用安装回执中的本地 doctor 检查固定运行时、插件和 Skill；我会在 Chrome 登录猎聘并打开“找简历”。使用包内 OpenCLI 执行 liepin connect -f json，核对返回的页面与 page 标识。connect 仅证明绑定成功，不等于搜索或详情已验收。不要运行旧 diagnose，不修改筛选、不提交搜索。遇到登录、权限或连接问题停止并说明实际错误。` : `请检查我刚安装的猎聘搜索是否能连接浏览器和猎聘页面。\n1. 运行 opencli doctor，检查 Chrome 扩展和浏览器连接。\n2. 我已在 Chrome 登录 https://h.liepin.com 并打开“找简历”。运行 opencli liepin diagnose -f json；该命令可能打开搜索页，但不要提交搜索或修改筛选。\n3. 检查返回的页面地址、可见筛选控件和 riskSignals。只有页面确实可读、没有登录或风控阻断时，才能告诉我“猎聘页面检查通过”。命令退出码为 0 不足以证明通过。\n4. 若失败，请明确指出是扩展连接、账号登录、账号权限还是页面限制，停在失败步骤指导我处理。`;
  const searchPrompt = mcpRelease ? mcpGuide.search : taskRelease ? `请使用已安装的 hunter-liepin-search Skill 完成一次试搜。职位关键词：${keyword.trim() || '请先询问我'}；城市：${city.trim() || '不限'}。读取 Skill 的任务流程，使用安装包的固定运行时，创建本地任务及共用站点范围，记录我给出的条件。先展示方案，确认后授权该轮并运行 task 方式的 search；当前页最多读取5条，不翻页。不要在 search 前再独立清空或重复 prepare。保留结果与来源，汇报实际条数和待核实项；不联系、不收藏、不保存搜索方案。未知结果先核对，不重复提交。` : `请使用 hunter-liepin-search Skill 完成一次猎聘搜索验收。\n职位关键词：${keyword.trim() || '请先向我询问职位关键词'}\n城市：${city.trim() || '不限，不要添加城市筛选'}\n\n先读取 opencli liepin conditions，使用实际支持的参数；只使用我提供的条件，不补造学历、经验等要求。运行 prepare 设置并回读筛选，向我展示条件，等我确认后提交一次 search（仅 1 页、最多 5 条）。遇到验证码、限制或条件不匹配即停止，不自动重试。\n请列出实际读取的候选人摘要、实际返回条数、页面总数原文和待核实项；若无结果就如实说明。不要联系候选人、收藏或保存搜索方案。`;
  const supportPrompt = `我在安装猎聘搜索独立包时遇到问题，入口：${url}。\n电脑系统：${platform === 'windows' ? 'Windows' : 'macOS'}\n当前步骤：${steps[step]}\n发布版本：${release?.version ?? '未能读取'}\n请先看我提供的真实报错，再做只读检查，定位失败步骤。不要反复重装。需要我补充信息时，只索取脱敏错误和版本输出，不要索取账号密码或令牌。${platform === 'windows' ? '\n\n' + windowsInstallAcceptance : ''}`;

  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setCopyError(false); }
    catch { setCopyError(true); setCopied(''); }
  }
  function go(index: number) {
    setStep(index); setCopied('');
    requestAnimationFrame(() => document.getElementById('installation')?.scrollIntoView({ behavior: 'smooth' }));
  }
  function confirm(checked: boolean) {
    setCompleted(values => values.map((value, index) => index === step ? checked : index > step && !checked ? false : value));
  }
  function choosePlatform(value: Platform) {
    if (value !== platform) { setPlatform(value); setCompleted([false, false, false, false]); setCopied(''); }
  }


  return <main className={styles.page}>
    <nav className={styles.topbar} aria-label="页面导航"><span>猎策 · 猎聘搜索</span><button onClick={() => copy('share', url)}>{copied === 'share' ? '页面链接已复制' : '分享安装页 ↗'}</button></nav>
    <ProductSectionNav sections={[{ id: 'overview', label: '产品介绍' }, { id: 'installation', label: '安装与连接' }, ...(reportRelease ? [{ id: 'usage-examples', label: '使用示例' }] : [])]} />
    <header id="overview" className={styles.hero}>
      <div><p className={styles.eyebrow}>猎聘独立安装与使用</p><h1>从安装到第一次搜索，<br />跟着这一页做完。</h1><p className={styles.intro}>把职位要求交给你的 AI 助手，在猎聘准备筛选、搜索候选人、读取结果。无需安装其他猎策产品。</p><div className={styles.heroActions}><a className={styles.primary} href="#installation">开始安装 <span aria-hidden="true">↓</span></a><span className={styles.badge}>{releaseLabel(releaseState, release)}</span>{reportRelease && <a href="#usage-examples">已装好？查看使用示例 →</a>}</div></div>
      <aside className={styles.summary}><span className={styles.eyebrow}>安装后你会得到</span><ul><li><strong>按职位条件筛选</strong><span>关键词、城市、学历、工作经验等</span></li><li><strong>读取候选人结果</strong><span>单次搜索、读取当前页、保留实际摘要</span></li><li><strong>复用搜索方案</strong><span>按指令保存、应用和删除方案</span></li>{reportRelease && <li><strong>候选人报告与短名单</strong><span>可见详情、两阶段复核、比较筛选与四格式导出</span></li>}</ul><p>使用你自己的猎聘猎头账号。包内包含猎聘搜索 Skill 和{mcpRelease ? '官方 Site Adapter 对应运行时' : '对应插件'}。</p></aside>
    </header>

    <section id="installation" className={styles.installation} aria-labelledby="install-title">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>一步一步完成</p><h2 id="install-title">猎聘搜索安装向导</h2></div><p>在 AI 助手里执行，在这里核对结果。</p></div>
      <ol className={styles.steps} aria-label="安装进度">{steps.map((label, index) => <li key={label}><button aria-current={step === index ? 'step' : undefined} disabled={index > 0 && !completed.slice(0, index).every(Boolean)} onClick={() => go(index)}><span>{completed[index] ? '✓' : `0${index + 1}`}</span><strong>{label}</strong></button></li>)}</ol>
      <div className={styles.workbench}>
        <div className={styles.workarea}>
          <p className={styles.eyebrow}>第 {step + 1} 步 / 共 4 步</p>
          {step === 0 && <>
            <h3>准备好电脑和 AI 助手</h3><p>使用能访问本地文件和终端的 WorkBuddy、Codex 或 Claude Code。纯网页聊天不能代替本地安装。</p>
            <div className={styles.platforms} role="group" aria-label="电脑系统"><button aria-pressed={platform === 'mac'} onClick={() => choosePlatform('mac')}>macOS</button><button aria-pressed={platform === 'windows'} onClick={() => choosePlatform('windows')}>Windows</button></div>
            <CopyBox copiedId={copied} onCopy={copy} id="environment" text={environmentPrompt} />
            <p className={styles.help}>还没有 Node.js？<a href="https://nodejs.org/" target="_blank" rel="noreferrer">打开官方下载页 ↗</a>。安装完成后重新打开 AI 助手，再检查版本。</p>
          </>}
          {step === 1 && <>
            <h3>安装猎聘搜索包</h3><p>复制下面这段话到你的 AI 助手，它会完成下载、校验、安装和本地检查。</p>
            {ready ? <><CopyBox copiedId={copied} onCopy={copy} id="install" text={installPrompt} /><details className={styles.details}><summary>手动安装与直接下载</summary><p>在{platform === 'windows' ? 'PowerShell' : '终端'}中执行：</p><CopyBox copiedId={copied} onCopy={copy} id="command" text={command} label="复制安装命令" /><a href={`${appUrl}/api/products/liepin-search/download`}>下载安装包 v{release.version} ↓</a><p className={styles.hash}>安装包 .tar.gz 的 SHA-256（不是 install.ps1）：{release.sha256}</p></details></> : <div role="alert" className={styles.notice}><strong>{releaseLabel(releaseState, release)}</strong><p>现在不能获取有效的安装包，请重新读取版本后继续。</p><button disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>{refreshing ? '正在重试…' : '重新读取版本'}</button></div>}
            <p className={styles.help}>本地检查通过后，还要完成下一步的浏览器和猎聘页面检查。</p>
          </>}
          {step === 2 && <>
            <h3>连接 Chrome，再检查猎聘页面</h3><p>{mcpRelease ? '本地组件已装好，接着加载持久兼容扩展，并把MCP连接配置到你使用的AI助手。' : '插件已装好，现在连接你正在使用的猎聘账号。'}</p>
            <ol className={styles.instructions}><li>{mcpRelease ? <>在 Chrome 扩展管理页加载安装回执里的兼容扩展目录，核对固定ID，并完成助手的MCP接入。</> : <><a href="https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk" target="_blank" rel="noreferrer">在 Chrome 安装 OpenCLI 扩展 ↗</a>，并确认扩展已启用。</>}</li><li><a href="https://h.liepin.com" target="_blank" rel="noreferrer">打开猎聘猎头端 ↗</a>，登录后进入“找简历”。</li><li>把下面的检查指令交给 AI 助手。</li></ol>
            <CopyBox copiedId={copied} onCopy={copy} id="connect" text={connectPrompt} />
          </>}
          {step === 3 && <>
            <h3>{completed[3] ? '已完成首次搜索验收' : '用一个真实职位试搜'}</h3><p>先核对筛选条件，再搜索一页、最多读取 5 条。请把下面的指令交给 AI 助手执行。</p>
            <div className={styles.fields}><label>职位关键词<input value={keyword} onChange={event => { setKeyword(event.target.value); setCopied(''); confirm(false); }} placeholder="例如：电机结构工程师" maxLength={160} /></label><label>城市（选填）<input value={city} onChange={event => { setCity(event.target.value); setCopied(''); confirm(false); }} placeholder="例如：深圳" maxLength={80} /></label></div>
            <CopyBox copiedId={copied} onCopy={copy} id="search" text={searchPrompt} label="复制首次搜索指令" />
            {completed[3] && <div className={styles.success} role="status"><strong>安装、连接与首次搜索已由你确认完成。</strong><p>以后向 AI 助手说“使用猎聘搜索 Skill，帮我搜索这个职位”，即可继续使用。需要保存搜索方案时，再明确告诉它方案名称。</p></div>}
          </>}
          {copyError && <p role="alert" className={styles.error}>复制失败，请手动选中上面的文字复制。</p>}
          <label className={styles.confirm}><input type="checkbox" checked={completed[step]} disabled={step === 1 && !ready} onChange={event => confirm(event.target.checked)} /><span>{[
            mcpRelease ? '我已确认 Node.js 22+、npm、Chrome和当前AI助手可用' : taskRelease ? '我已确认 Node.js 22+ 和 Chrome 可用，固定运行时由下一步安装包提供' : '我已看到 Node.js 22+、OpenCLI 的真实版本，Chrome 可以打开',
            mcpRelease ? '本地doctor通过，已保存持久安装回执和hunter-liepin-mcp Skill路径；浏览器接入待下一步' : '官方安装流程与本地 doctor 通过，猎聘命令可加载，AI 助手已能发现 Skill',
            mcpRelease ? 'MCP与Skill可被助手发现，tabs/bind已核对正确猎聘页面' : taskRelease ? 'connect 已返回正确猎聘搜索页和 page 标识，未遇到连接或登录错误' : '浏览器连接正常，AI 已确认猎聘搜索页和筛选控件可读，未遇到限制',
            '筛选条件正确，AI 已返回实际搜索结果或明确的无结果说明',
          ][step]}</span></label>
          <footer className={styles.actions}>{step > 0 && <button className={styles.secondary} onClick={() => go(step - 1)}>上一步</button>}{step < 3 ? <button className={styles.primary} disabled={!completed[step] || (step === 1 && !ready)} onClick={() => go(step + 1)}>已核对，继续{steps[step + 1]} →</button> : <button className={styles.secondary} onClick={() => { setKeyword(''); setCity(''); confirm(false); }}>搜索另一个职位</button>}</footer>
        </div>
        <aside className={styles.checklist}>
          <h3>这一步怎样算通过？</h3><p>{[
            mcpRelease ? 'Node.js 22+、配套npm和Chrome可用；已确定目标AI助手。' : taskRelease ? 'Node.js 22+ 和 Chrome 已可用；下一步由安装包提供固定 OpenCLI 运行时。' : 'AI 返回真实的 Node.js 和 OpenCLI 版本号，Chrome 能正常打开。',
            mcpRelease ? '本地doctor通过；回执中有持久Skill、扩展目录和客户端配置。此时不要求浏览器已连接。' : 'doctor 各项通过，能看到猎聘搜索命令，AI 助手能找到 hunter-liepin-search。',
            mcpRelease ? '助手能发现MCP工具和hunter-liepin-mcp，已绑定现有猎聘页面；首次搜索在下一步验证。' : taskRelease ? '包内 doctor 通过，connect 返回正确的搜索页绑定；搜索结果在下一步验证。' : 'opencli doctor 通过，猎聘诊断返回实际搜索页和可见控件，没有登录或风控阻断。',
            mcpRelease ? '搜索前已确认收藏目标分组或不收藏；筛选与需求一致，一次搜索保存结构化结果和可视化报告，未知结果已核对。' : taskRelease ? '任务中的条件已确认，一次搜索保存真实结果或明确无结果；不能有未核对操作。' : 'prepare 回读的条件与你要求一致；一次搜索返回真实卡片或明确的无结果，不能有未解决错误。',
          ][step]}</p>
          <h3>遇到问题</h3><p>{[
            '提示找不到命令：先重新打开终端或 AI 助手。版本不足：按 AI 给出的具体步骤升级。',
            '校验值不匹配：停止安装并重新读取发布信息。Skill 找不到：按安装输出核对目录，再刷新技能或新开会话。',
            '扩展未连接：确认 Chrome 正在运行且扩展已启用。账号未登录：手动登录。遇到验证码或限制：暂停操作，由本人处理。',
            '条件回读不一致就停止。没有结果时先检查职位和城市，不自动放宽条件或重复提交。',
          ][step]}</p><button className={styles.secondary} onClick={() => copy('support', supportPrompt)}>{copied === 'support' ? '问题排查指令已复制' : '复制问题排查指令'}</button>
          <p className={styles.footnote}>勾选记录的是你和 AI 核对的结果。网页不会直接检测或操作你的电脑。</p>
        </aside>
      </div>
    </section>
    {reportRelease && <LiepinUsageExamples mcp={mcpRelease} />}
    <section className={styles.aftercare} aria-label="更新与使用说明"><Info title="以后怎么更新？">重新打开本页，在“安装猎聘”步骤运行当前官方安装方式；或使用安装完成时显示的该产品专用更新命令。</Info><Info title="使用范围">{reportRelease ? '适用于猎聘猎头端。支持搜索、可见详情、收藏、证据评估、两阶段短名单与报告。部分可见详情不代表完整简历；不自动联系、发送消息或付费解锁，最终人选由人复核。' : '适用于猎聘猎头端。支持搜索与方案管理；完整简历评估、自动联系和消息发送不在这个包内。'}</Info><Info title="已验证到哪里？">{mcpRelease ? '新版已完成指定候选的 macOS 安装与猎聘业务验收；Windows 真机安装、诊断、浏览器连接及合成页操作已通过。目标助手首次业务仍需单独核对，安装成功不等于当前账号连接成功，请按第3、4步分别确认。' : '发布包下载、macOS 隔离安装和本地检查已通过。Windows 组件可用性已有用户反馈，官方 PowerShell 通道仍需真机验收；每个账号的页面连接按第 3 步确认。'}</Info></section>
    <footer className={styles.bottom}><span>猎策 · 猎聘搜索</span><button onClick={() => copy('share', url)}>{copied === 'share' ? '链接已复制' : '复制独立安装页链接'}</button></footer>
  </main>;
}

function Info({ title, children }: { title: string; children: ReactNode }) {
  return <div><h2>{title}</h2><p>{children}</p></div>;
}

function CopyBox({ id, text, copiedId, onCopy, label = '复制给 AI 助手' }: {
  id: string; text: string; copiedId: string; onCopy: (id: string, text: string) => Promise<void>; label?: string;
}) {
  return <div className={styles.copyBox}><pre>{text}</pre><button className={styles.primary} onClick={() => onCopy(id, text)}>{copiedId === id ? '已复制，请粘贴到 AI 助手' : label}</button></div>;
}
