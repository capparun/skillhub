'use client';
import Image from 'next/image';
import {useState} from 'react';
import styles from './landing.module.css';

const file = '/download/maimai-ego-1.7.2.zip';
const install = '请在当前项目安装我下载的 maimai-ego-1.7.2.zip。先核对 SHA-256 为 3d35ccb16e1a40a3b68687d8379dae8a26e6e0b44df4c9aadc7fd61e0693df4b。解压后检查 Node.js 20.18.1 或以上，按包内安装说明使用 install.mjs 安装到当前项目，WorkBuddy 用 --agent workbuddy，Codex 用 --agent codex，并用 --project-dir 指定当前项目，先预检再安装。用相同目录运行 doctor.mjs，确认 cskh-sourcing-maimai 版本为 1.7.2。';
const connect = '请检查 ego-browser --version。如果缺少 Ego Lite，提示我先获取 Mac 安装包并打开 App 完成首次设置。准备好后，使用本项目的 cskh-sourcing-maimai 打开脉脉招聘端，由我登录，再确认能看到招聘页面。';
const search = '请在脉脉搜索产品经理，期望城市选上海，最多取 1 人。告诉我页面实际选中了什么，把结果导出成可打开的本地 HTML。只浏览，遇到验证就停下。';
function Prompt({label,text}:{label:string;text:string}) {
  const [status,setStatus]=useState('');
  return <div><button type="button" className={styles.secondary} onClick={async()=>{try{await navigator.clipboard.writeText(text);setStatus('已复制，可粘贴到助手。')}catch{setStatus('请展开下方文字，手动复制。')}}}>{label}</button><span role="status"> {status}</span><details className={styles.details}><summary>查看可复制的文字</summary><pre>{text}</pre></details></div>;
}
export function MaimaiLanding(){
  return <main className={styles.page}>
    <nav className={styles.topbar}><a href="/" style={{display:"inline-flex",alignItems:"center",gap:8}}><Image src="/hunter-dog.svg" width={48} height={48} alt="" />猎策</a><a href="#installation">安装指引 ↓</a><a href="/skills/maimai/help.html">完整使用帮助</a></nav>
    <section className={styles.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}>脉脉人才寻访 · Ego Lite 版 1.7.2</p><h1>从脉脉搜索到<br/><em>候选人短名单。</em></h1><p className={styles.intro}>告诉助手想找什么人。它帮你搜索、整理可见履历，你决定谁入选，并把理由和名单保存在本机。</p><a className={styles.primary} href={file} download>下载 1.7.2 安装包 ↓</a><p className={styles.caption}>ZIP 安装包 · 已在 Mac 实测 · 单独安装 Ego Lite</p></div>
    <aside className={styles.flow}><div className={styles.flowHeading}>你会拿到什么</div><ol>{[['搜索结果','按关键词、城市、经历等条件找人，核对页面选中的条件。'],['人工审核页','展开履历，选择入选、淘汰或暂缓，填下理由。'],['可交付的名单','把选中的人导出为 HTML、CSV 或 JSON。']].map(([name,desc],i)=><li key={name}><span className={styles.number}>0{i+1}</span><div><strong>{name}</strong><p>{desc}</p></div></li>)}</ol></aside></section>
    <section className={styles.preparation}><header><h2>开始前，你需要什么？</h2></header><dl><div><dt>电脑与助手</dt><dd>以下步骤适用于 Mac 上的 Codex 项目，需要 Node.js 20.18.1 或以上。Linux 尚未实机复验，Windows WorkBuddy 用户可下载同一安装包，真实页面待 Windows 实机验收。</dd></div><div><dt>Ego Lite 浏览器</dt><dd>在线找人需要单独安装 Ego Lite。若尚未安装，请从 https://lite.ego.app/ 获取对应系统的安装包，打开 App 完成首次设置。整理已有名单可以离线进行。</dd></div><div><dt>脉脉账号</dt><dd>准备能进入脉脉招聘端的账号，在 Ego Lite 窗口亲自登录。</dd></div></dl></section>
    <section id="installation" className={styles.installation}><h2>第一次使用，跟着做三步</h2>{[['安装到当前项目','下载并将 ZIP 交给项目中的助手，复制下面的指令。安装成功后，重新打开项目对话。','复制安装指令',install],['连接招聘账号','让助手检查浏览器并打开登录页。能读到招聘页面，才算连接成功。','复制连接指令',connect],['试找一个人','把下面的岗位和城市换成自己的，小范围验证搜索和导出。','复制试用指令',search]].map(([title,desc,label,text],i)=><article key={title} className={styles.step}><span className={styles.stepNumber}>0{i+1}</span><div className={styles.stepContent}><h3>{title}</h3><p>{desc}</p><Prompt label={label} text={text}/></div></article>)}</section>
    <section className={styles.installation}><h2>Windows PC · WorkBuddy</h2><p>请下载本页的 1.7.2 安装包，并安装 Windows 版 Ego Lite。真实招聘页面仍待 Windows 实机验收。</p><a href="/skills/maimai/help.html#windows-workbuddy">查看 PowerShell 安装与首次搜索步骤</a></section>
    <section className={styles.boundary}><h2>短名单之后，还能做什么？</h2><p>查看已有职位、投递、访客和会话，准备个性化跟进草稿。投递状态仅预览，消息由人工处理。备注、关注和加入储备会改变平台数据，执行前要先确认对象和动作。</p><p>1.7.2 增加 Windows 启动适配，并修复特殊目录名下的导出。</p><a href="/download/maimai-ego-1.7.2.zip.sha256">下载安装包校验值</a></section>
  </main>;
}
