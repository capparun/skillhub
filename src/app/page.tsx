"use client";

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SiteHeader } from './components/site-header';
import { api } from '@/lib/client/api';
import { releaseLabel, type ReleaseState } from '@/lib/product-release';
import styles from './home.module.css';

type Release = { version: string; sha256: string } | null;
type Product = { slug: string; latestRelease: Release };
const channels = [
  { slug: 'soho-sourcing', name: 'LinkedIn 人才寻访', mark: 'in', href: '/skills/linkedin', intro: '面向海外与跨国人才，从职位要求推进到候选人筛选。', bullets: ['站内与 X-Ray 双通道搜索', '匹配判断、候选人排序与寻访报告'], environment: 'Chrome · OpenCLI' },
  { slug: 'liepin-search', name: '猎聘搜索', mark: '猎', href: '/skills/liepin-search', intro: '在猎聘猎头端准备筛选条件，搜索并读取候选人信息。', bullets: ['筛选准备、搜索与结果读取', '搜索方案管理；完整业务闭环仍待验收'], environment: '猎聘猎头端 · OpenCLI' },
  { slug: 'maimai-only', name: '脉脉人才寻访', mark: '脉', href: '/skills/maimai', intro: '从本土人才网络发现候选人，整理信息并导出到本机。', bullets: ['搜索、候选人信息读取与本地导出', '官方公开下载安装；客户环境需验收'], environment: 'ego-lite · macOS / Linux' },
];
const routes: Record<string, string> = { 'soho-sourcing': '/skills/linkedin', 'hunter-align': '/skills/hunter-align', 'liepin-search': '/skills/liepin-search', 'maimai-only': '/skills/maimai', 'gllue-only': '/skills/gllue' };

function ProductDirectory() {
  const params = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [state, setState] = useState<ReleaseState>('loading');
  useEffect(() => {
    const slug = params.get('install');
    if (slug && routes[slug]) window.location.replace(routes[slug]);
  }, [params]);
  useEffect(() => {
    let cancelled = false;
    api<{ products: Product[] }>('/api/products').then(({ products }) => {
      if (!cancelled) { setProducts(products); setState('ready'); }
    }).catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, []);
  const status = (slug: string) => releaseLabel(state, products.find(p => p.slug === slug)?.latestRelease ?? null);
  return <main className={styles.page}>
    <SiteHeader nav="none" brandLinked={false} />
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>猎策 · 猎头业务工具</p><h1>把时间留给判断，<br /><em>把重复工作交给工具。</em></h1><p className={styles.lead}>从职位需求对齐，到不同渠道找人，再到人才库管理。按你的业务选择产品，各自有独立的介绍、交付范围和安装步骤。</p><a className={styles.primary} href="#products">查看产品 <span aria-hidden="true">↓</span></a></div>
      <aside className={styles.map} aria-label="猎头工作流程"><span className={styles.mapCaption}>一次寻访，三个环节</span><ol><li><span>01</span><div><strong>先明确，找什么人</strong><p>职位要求 → 人才画像</p></div></li><li><span>02</span><div><strong>再选择，在哪里找</strong><p>LinkedIn / 猎聘 / 脉脉</p></div></li><li><span>03</span><div><strong>把结果沉淀下来</strong><p>候选人判断与人才库管理</p></div></li></ol></aside>
    </section>
    <section id="products" className={styles.products}>
      <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>按业务选择</p><h2>每个产品，独立了解与交付。</h2></div><p>需要哪个平台，就打开对应页面。</p></header>
      <article className={styles.align}><div><span className={styles.label}>职位准备</span><h3>职位需求对齐</h3><p>把模糊的 JD 变成清楚的人才画像与寻访任务书。适合开始找人前，先与用人方厘清要求。</p></div><div className={styles.alignAction}><span className={styles.status}>{status('hunter-align')}</span><Link className={styles.textLink} href="/skills/hunter-align">了解职位对齐 <span aria-hidden="true">↗</span></Link></div></article>
      <div className={styles.grid}>{channels.map((item) => <article key={item.slug} className={styles.card}>
        <div className={styles.cardTop}><span className={styles.mark} aria-hidden="true">{item.mark}</span><span className={styles.status}>{status(item.slug)}</span></div>
        <h3>{item.name}</h3><p>{item.intro}</p><ul>{item.bullets.map(text => <li key={text}>{text}</li>)}</ul><div className={styles.cardBottom}><p>{item.environment}</p><Link className={styles.textLink} href={item.href}>介绍与安装 <span aria-hidden="true">↗</span></Link></div>
      </article>)}</div>
      <article className={styles.gllue}><div><span className={styles.label}>人才库管理</span><h3>Gllue 人才库</h3><p>库内查询、外部候选人查重与授权维护。提供独立安装包和 Windows PowerShell 引导。</p></div><div className={styles.alignAction}><span className={styles.status}>{status('gllue-only')}</span><Link className={styles.textLink} href="/skills/gllue">介绍与安装 ↗</Link></div></article>
    </section>
    <section className={styles.delivery}><h2>拿到产品后，怎么开始？</h2><div><article><span>01 / 了解范围</span><p>在独立产品页核对能力、电脑要求和当前交付状态。</p></article><article><span>02 / 交给助手安装</span><p>把对应安装话术交给 WorkBuddy、Codex 或 Claude Code，逐项检查实际输出。</p></article><article><span>03 / 用真实任务验证</span><p>先完成连接检查，再用小规模任务确认搜索、读取和结果交付。</p></article></div></section>
    <footer className={styles.footer}><span>© 2026 猎策 Hunter Works</span><span>本站提供介绍、安装与更新；业务任务在本机执行。</span></footer>
  </main>;
}
export default function Home() { return <Suspense><ProductDirectory /></Suspense>; }
