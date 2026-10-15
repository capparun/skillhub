'use client';

import { useEffect, useState } from 'react';
import { api, type SessionInfo } from '@/lib/client/api';
import { type ReleaseState, releaseLabel } from '@/lib/product-release';
import { SiteHeader } from '../../components/site-header';
import { BeginnerInstallFlow } from '../../components/beginner-install-flow';
import { InstallModal, type ModalProduct } from '../../components/install-modal';
import styles from '../../page.module.css';
import usageStyles from './usage.module.css';
import { ProductSectionNav } from '../../components/product-section-nav';
import { LinkedInUsageExamples } from './usage-examples';

const fallback: ModalProduct = {
  slug: 'soho-sourcing',
  name: 'LinkedIn 人才寻访',
  description: '从职位要求出发，在 LinkedIn 搜索候选人，完成匹配判断、排序和寻访报告。',
  isPublic: false,
  latestRelease: null,
};

export function LinkedInLanding() {
  const [product, setProduct] = useState<ModalProduct>(fallback);
  const [releaseState, setReleaseState] = useState<ReleaseState>('loading');
  const [me, setMe] = useState<SessionInfo['user'] | null>(null);
  const [platform, setPlatform] = useState<'mac' | 'windows' | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ products: ModalProduct[] }>('/api/products').then(({ products }) => {
      if (cancelled) return;
      const found = products.find((item) => item.slug === 'soho-sourcing');
      if (!found) { setReleaseState('error'); return; }
      setProduct({ ...found, name: fallback.name, description: fallback.description });
      setReleaseState('ready');
    }).catch(() => { if (!cancelled) setReleaseState('error'); });
    api<SessionInfo>('/api/auth/me').then(({ user }) => {
      if (!cancelled) setMe(user);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return <main className={styles.page}>
    <div className={usageStyles.headerWidth}><SiteHeader nav="none" brandLinked={false} /></div>
    <ProductSectionNav className={usageStyles.sectionNav} sections={[{ id: 'overview', label: '产品介绍' }, { id: 'install-center', label: '安装与连接' }, { id: 'usage-examples', label: '使用示例' }]} />
    <section id="overview" className={styles.hero}>
      <div className={styles.kicker}><span /> 猎策 · LinkedIn 人才寻访</div>
      <h1>在 LinkedIn 找人，<em>把筛选依据一起交付。</em></h1>
      <p>{fallback.description} 在 WorkBuddy、Codex 或 Claude Code 中使用，职位与候选人数据留在本机。</p>
      <button className={styles.heroButton} onClick={() => document.getElementById('install-center')?.scrollIntoView({ behavior: 'smooth' })}>查看 LinkedIn 安装步骤</button><a className={usageStyles.usageLink} href="#usage-examples">已装好？查看使用示例 →</a>
    </section>
    <section className={styles.list} aria-label="LinkedIn 产品介绍">
      <article className={styles.card}>
        <h2>LinkedIn 人才寻访</h2>
        <p className={styles.cardDesc}>{releaseLabel(releaseState, product.latestRelease)}</p>
        <ul className={styles.bullets}>
          <li>LinkedIn 站内与 X-Ray 双通道搜索</li>
          <li>按职位要求判断匹配程度，排序并标注待核实项</li>
          <li>生成候选人初评与寻访报告</li>
          <li>包含职位需求对齐、寻访入口与 LinkedIn 寻访技能；具体以安装包清单为准</li>
        </ul>
      </article>
    </section>
    <BeginnerInstallFlow product={product} releaseState={releaseState} onInstall={setPlatform} />
    <LinkedInUsageExamples />
    <footer className={styles.footer}><span>© 2026 猎策 · LinkedIn 人才寻访</span><span>LOCAL / PRIVATE</span></footer>
    {platform && <InstallModal product={product} me={me} initialPlatform={platform} loginHref="/login?next=%2Fskills%2Flinkedin" onClose={() => setPlatform(null)} />}
  </main>;
}
