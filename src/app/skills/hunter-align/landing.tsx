"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "../../components/site-header";
import { InstallModal, ModalProduct } from "../../components/install-modal";
import { api } from "@/lib/client/api";
import styles from "./landing.module.css";

interface ProductInfo {
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  latestRelease: { version: string; sha256: string } | null;
}

// 接口不可用时的兜底;免费技能的名称与简介保持稳定。
const FALLBACK: ProductInfo = {
  slug: "hunter-align",
  name: "职位需求对齐",
  description:
    "把一份真实 JD 交给 Agent，通过关键追问厘清隐含要求，形成可直接用于寻访的人才画像和任务书。",
  isPublic: true,
  latestRelease: null,
};

const FEATURES = [
  {
    icon: "🔍",
    title: "JD 诊断",
    desc: "识别 JD 里模糊、缺失、自相矛盾的要求，先搞清楚这份职位到底在找什么人。",
  },
  {
    icon: "❓",
    title: "关键问题追问",
    desc: "像资深顾问一样向你追问：汇报线、团队规模、必须项与加分项、为什么之前没招到。",
  },
  {
    icon: "🎯",
    title: "人才画像",
    desc: "把答案收敛成一份结构化人才画像：硬性条件、优先背景、排除项，一目了然。",
  },
  {
    icon: "📋",
    title: "寻访任务书",
    desc: "输出可直接执行的寻访任务书，明确搜索方向、目标公司与关键词，无缝衔接后续寻访。",
  },
];

const STEPS = [
  {
    title: "复制安装 Prompt 发给你的 Agent",
    desc: "点「免费安装」复制一段 Prompt，发给 WorkBuddy / Claude Code / Codex，它会自动完成下载与安装。",
  },
  {
    title: "把 JD 发给它，回答几个追问",
    desc: "粘贴真实 JD，技能会逐条诊断并向你追问关键问题，几轮对话就能厘清隐含要求。",
  },
  {
    title: "拿到人才画像与寻访任务书",
    desc: "产出物直接保存在本地，可以继续交给寻访技能去 LinkedIn 找人。",
  },
];

const FAQS = [
  {
    q: "需要登录或付费吗？",
    a: "都不需要。职位需求对齐是免费技能，复制 Prompt 即可安装，没有账号体系。",
  },
  {
    q: "我的 JD 和候选人数据会传到哪里？",
    a: "哪里都不去。技能运行在你本地的 Agent 里，JD、追问答案和产出物都保存在你自己的电脑上。",
  },
  {
    q: "支持哪些 Agent？",
    a: "任何能访问本地终端与文件的 Agent 环境都可以，包括 WorkBuddy、Claude Code、Codex 和 OpenClaw。",
  },
  {
    q: "和「SOHO 猎头人才寻访」是什么关系？",
    a: "对齐是寻访的第一步：先用它把需求厘清，再用寻访包去 LinkedIn 找人。寻访包包含 LinkedIn 插件与运行时，由交付方授权安装。",
  },
];

export function HunterAlignLanding() {
  const [product, setProduct] = useState<ProductInfo>(FALLBACK);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ products: ProductInfo[] }>("/api/products")
      .then((data) => {
        const found = data.products.find((p) => p.slug === "hunter-align");
        if (!cancelled && found) setProduct(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const modalProduct: ModalProduct = {
    slug: product.slug,
    name: product.name,
    description: product.description,
    isPublic: product.isPublic,
    latestRelease: product.latestRelease,
  };

  return (
    <main className={styles.page}>
      <SiteHeader nav="minimal" />

      <section className={styles.hero}>
        <div className={styles.kicker}>
          <span /> 免费技能 · 免登录安装
        </div>
        <h1>
          职位需求对齐
          <small className={styles.slug}>hunter-align</small>
        </h1>
        <p>
          把一份真实 JD 交给你的 Agent：它先诊断出模糊与缺失的要求，向你追问关键问题，
          最后产出可直接用于寻访的人才画像和任务书。免费、免登录，数据不离开你的电脑。
        </p>
        <div className={styles.ctaRow}>
          <button className={styles.primaryCta} onClick={() => setShowInstall(true)}>
            免费安装
          </button>
          <Link className={styles.secondaryCta} href="/">
            查看全部技能 →
          </Link>
        </div>
        <ul className={styles.factStrip}>
          <li>免费</li>
          <li>免登录</li>
          <li>数据不出本地</li>
          <li>1 分钟安装</li>
        </ul>
      </section>

      <section className={styles.section} aria-label="功能">
        <div className={styles.sectionHeading}>
          <h2>它能帮你做什么</h2>
          <span>FEATURES</span>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div className={styles.featureCard} key={f.title}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-label="用法">
        <div className={styles.sectionHeading}>
          <h2>怎么用</h2>
          <span>3 STEPS</span>
        </div>
        <ol className={styles.stepList}>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className={styles.stepNo}>{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-label="常见问题">
        <div className={styles.sectionHeading}>
          <h2>常见问题</h2>
          <span>FAQ</span>
        </div>
        <div className={styles.faqList}>
          {FAQS.map((f) => (
            <details className={styles.faqItem} key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>先对齐，再寻访。</h2>
        <p>需求厘清了，候选人搜索才不会跑偏。一分钟装好，从手头这份 JD 开始。</p>
        <button className={styles.primaryCta} onClick={() => setShowInstall(true)}>
          免费安装职位需求对齐
        </button>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 猎策 Hunter Works</span>
        <Link href="/">返回技能分发首页</Link>
      </footer>

      {showInstall && (
        <InstallModal
          product={modalProduct}
          me={null}
          onClose={() => setShowInstall(false)}
        />
      )}
    </main>
  );
}
