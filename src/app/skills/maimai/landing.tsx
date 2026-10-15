'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import styles from './landing.module.css';

const connectPrompt = `请使用刚安装的 cskh-sourcing-maimai Skill 检查脉脉连接。
先读取 Skill 的使用说明，定位实际安装目录下的 scripts/mm.mjs，不要假设 mm 是全局命令。
通过该脚本的 login 命令打开 ego-lite，由我手动登录脉脉；不要代填或读取凭据。登录后按说明执行 login --resume，报告实际检查结果。
遇到验证码或账号限制就停止，让我手动处理；不要绕过或自动重试。本次只检查登录，不搜索、采集或联系候选人。`;

export function MaimaiLanding() {
  const [release, setRelease] = useState<{ version: string; sha256: string; downloadUrl: string } | null>(null);
  const [releaseError, setReleaseError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<{ version: string; sha256: string; downloadUrl: string }>('/api/releases/latest?product=maimai-only').then(data => {
      if (!data.version || !/^[a-f0-9]{64}$/.test(data.sha256) || !data.downloadUrl) throw new Error('Invalid release');
      if (!cancelled) setRelease(data);
    }).catch(() => { if (!cancelled) setReleaseError(true); });
    return () => { cancelled = true; };
  }, []);
  const installPrompt = release ? `请帮我安装猎策脉脉寻访技能，使用官方公开安装入口。
1. 确认系统为 macOS / Linux，Windows 不继续。检查 Node.js 20.18.1+ 和 ego-browser 0.5.1+。ego-lite 需单独安装，缺少时让我向交付方获取安装指引，不猜下载地址。
2. 核对 WorkBuddy 的实际技能目录，向我说明安装位置；已有旧版时先报告。通过环境变量 HUNTER_SKILLS_DIR 与 HUNTER_STATE_DIR 指定已确认的持久目录，让安装和 doctor 使用相同目录，不能指向临时解压目录。
3. 在终端运行：
curl -fsSL https://hunterskill.zeabur.app/install.sh | bash -s -- maimai-only
4. 官方脚本会获取最新发布、下载、校验 SHA-256、安装四个 Skills 并运行 doctor。当前页面版本 v${release.version}，安装包 SHA-256：${release.sha256}。此哈希对应 tar.gz，不对应 install.sh。
5. 报告实际版本、安装目录、doctor 输出，确认 WorkBuddy 能发现 cskh-align、cskh-sourcing、cskh-sourcing-maimai、cskh-update。必要时指导刷新或新开会话。
失败即停止；本次只安装与本地检查，不登录、不搜索、不联系候选人。` : '';
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState(false);
  async function copy(id: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(id); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <main className={styles.page}>
    <nav className={styles.topbar} aria-label="页面导航"><strong>猎策 <span>／ 脉脉人才寻访</span></strong><button onClick={() => copy('share', `${window.location.origin}/skills/maimai`)}>{copied === 'share' ? '链接已复制' : '分享此页面 ↗'}</button></nav>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><p className={styles.eyebrow}>人才寻访 · 脉脉</p><h1>找到人，<br /><em>也把信息整理好。</em></h1><p className={styles.intro}>把职位要求交给 AI 助手，在脉脉搜索候选人、读取信息，再导出到本机。让你把时间留给判断与沟通。</p><a className={styles.primary} href="#installation">开始准备安装 <span aria-hidden="true">↓</span></a><p className={styles.caption}>公开安装包 · 使用 ego-lite · 支持 macOS / Linux</p></div>
      <aside className={styles.flow} aria-label="脉脉寻访流程示意"><div className={styles.flowHeading}><span>一条清楚的寻访路径</span><span aria-hidden="true">脉</span></div><ol><li><span className={styles.number}>01</span><div><strong>先说清楚，找什么人</strong><p>职位要求 → 人才画像与搜索条件</p></div></li><li><span className={styles.number}>02</span><div><strong>到脉脉，搜索与读取</strong><p>候选人列表 → 可见的个人信息</p></div></li><li><span className={styles.number}>03</span><div><strong>整理结果，留在本机</strong><p>汇总信息 → 本地文件导出</p></div></li></ol><div className={styles.flowFoot}>流程示意 · 实际结果取决于账号权限与页面可见信息</div></aside>
    </section>
    <section className={styles.value} aria-label="产品能力"><article><span>需求准备</span><h2>先对齐，再找人</h2><p>整理职位要求，形成画像，减少凭关键词盲搜。</p></article><article><span>信息整理</span><h2>把候选人读清楚</h2><p>读取页面可见信息，保留待核实项，方便后续判断。</p></article><article><span>本地交付</span><h2>结果可以继续用</h2><p>导出到本机，在已有信息上继续整理与复核。</p></article></section>
    <section className={styles.preparation}><header><p className={styles.eyebrow}>安装前，先看这几项</p><h2>准备好电脑和浏览器。</h2></header><dl><div><dt>电脑</dt><dd>macOS / Linux 支持实际寻访；Windows 目前仅可处理已有本地数据。</dd></div><div><dt>浏览器</dt><dd>当前包使用 ego-lite，需单独安装。命令名为 ego-browser，交付包要求版本 0.5.1 或更高。</dd></div><div><dt>AI 助手</dt><dd>WorkBuddy、Codex 或 Claude Code，能够访问本地文件与终端。Node.js 需为 20.18.1 或更高版本。</dd></div><div><dt>交付状态</dt><dd>{release ? `公开安装包 v${release.version}，支持网站下载。` : releaseError ? '暂时无法读取发布信息，请刷新页面后重试。' : '正在获取发布信息。'} 脉脉核心 Skill 为 v1.3.0，客户环境仍需逐项验收。</dd></div></dl></section>
    <section id="installation" className={styles.installation}>
      <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>跟着做，不用记命令</p><h2>从安装，到第一次使用。</h2></div><p>每一步完成后，再继续下一步。</p></header>
      <article className={styles.step}><span className={styles.stepNumber}>01</span><div className={styles.stepContent}><h3>准备环境与官方安装包</h3><p>先准备 ego-lite 和 Node.js。可交给下一步的官方脚本下载，也可单独下载安装包。</p><span className={styles.check}>完成标志：电脑支持实际寻访，Node.js 与 ego-lite 可用。</span>{release && <p><a className={styles.secondary} href={release.downloadUrl}>下载安装包 v{release.version} ↓</a></p>}</div></article>
      <article className={styles.step}><span className={styles.stepNumber}>02</span><div className={styles.stepContent}><h3>复制话术，交给 WorkBuddy</h3><p>把话术发给助手。它会核对安装目录，通过官方入口下载、校验并安装技能，再运行 doctor。</p><div className={styles.promptActions}><button className={styles.primary} disabled={!release} onClick={() => copy('install', installPrompt)}>{copied === 'install' ? '安装话术已复制 ✓' : release ? '复制安装话术' : releaseError ? '发布信息读取失败' : '正在读取版本'}</button><span>复制后，粘贴到 WorkBuddy 对话框。</span></div><details className={styles.details}><summary>查看完整安装话术</summary><pre>{installPrompt || '取得有效发布信息后显示安装话术。'}</pre></details><span className={styles.check}>完成标志：安装与 doctor 检查通过，助手能识别交付包内的技能。</span></div></article>
      <article className={styles.step}><span className={styles.stepNumber}>03</span><div className={styles.stepContent}><h3>在 ego-lite 登录脉脉</h3><p>由你在浏览器中手动登录。把连接检查话术交给助手，确认账号页面实际可读。</p><div className={styles.promptActions}><button className={styles.secondary} onClick={() => copy('connect', connectPrompt)}>{copied === 'connect' ? '检查话术已复制 ✓' : '复制连接检查话术'}</button></div><details className={styles.details}><summary>查看完整连接检查话术</summary><pre>{connectPrompt}</pre></details><span className={styles.check}>完成标志：登录检查通过；遇到验证码或限制，停下手动处理。</span></div></article>
      <article className={styles.step}><span className={styles.stepNumber}>04</span><div className={styles.stepContent}><h3>用一个小任务确认能用</h3><p>提供一组职位条件，确认后完成小规模搜索、读取与导出。看实际输出，再决定是否继续正式寻访。</p><span className={styles.check}>完成标志：拿到可复核的候选人信息与本地导出文件。</span></div></article>
      {copyError && <p role="alert" className={styles.error}>复制失败，请展开完整话术后手动选中复制。</p>}
      <p role="status" aria-live="polite" className={styles.copyStatus}>{copied === 'share' ? '页面链接已复制' : copied === 'install' ? '安装话术已复制，可粘贴到 WorkBuddy。' : copied === 'connect' ? '连接检查话术已复制。' : ''}</p>
    </section>
    <section className={styles.boundary}><h2>你负责确认，工具负责执行。</h2><p>当前 Skill 用于只读寻访，不提供立即沟通、电话沟通、加好友或加入储备。导出处理不需要启动浏览器；页面上线也不代表客户环境已经验收。</p></section>
    <footer className={styles.footer}><span>© 2026 猎策 · 脉脉人才寻访</span><span>独立交付 · 本地运行</span></footer>
  </main>;
}
