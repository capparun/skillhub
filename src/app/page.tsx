"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "./components/site-header";
import { InstallModal, ModalProduct } from "./components/install-modal";
import { BeginnerInstallFlow } from "./components/beginner-install-flow";
import { api, SessionInfo } from "@/lib/client/api";
import styles from "./page.module.css";

interface ProductInfo {
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  latestRelease: { version: string; sha256: string } | null;
}

// 卡片展示文案:功能要点 + 包内容物标签,按 slug 匹配;未登记的产品只显示简介。
const CARD_PRESENTATION: Record<string, { bullets: string[]; includes: string[] }> = {
  "hunter-align": {
    bullets: [
      "诊断 JD,识别模糊与缺失的要求",
      "关键问题追问,厘清隐含条件",
      "产出人才画像与寻访任务书",
    ],
    includes: ["1 个技能"],
  },
  "soho-sourcing": {
    bullets: [
      "LinkedIn 站内 + X-Ray 双通道搜索",
      "AI 匹配打分与候选人排序",
      "候选人初评与寻访报告输出",
    ],
    includes: ["3 个技能", "LinkedIn 插件", "OpenCLI 运行时"],
  },
};

// 有独立介绍页的技能,卡片标题可点击进入详情(用于引流与 SEO)。
const LANDING_PAGES: Record<string, string> = {
  "hunter-align": "/skills/hunter-align",
};

// 接口不可用时的兜底展示,保证分发页始终可用。
const FALLBACK_PRODUCTS: ProductInfo[] = [
  {
    slug: "hunter-align",
    name: "职位需求对齐",
    description:
      "把一份真实 JD 交给 Agent,通过关键追问厘清隐含要求,形成可直接用于寻访的人才画像和任务书。",
    isPublic: true,
    latestRelease: null,
  },
  {
    slug: "soho-sourcing",
    name: "SOHO 猎头人才寻访",
    description:
      "接着已经对齐的需求,在 LinkedIn 发现候选人,完成匹配判断、排序和寻访报告。",
    isPublic: true,
    latestRelease: null,
  },
];

function DistributionPage() {
  const searchParams = useSearchParams();
  const [me, setMe] = useState<SessionInfo["user"] | null>(null);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<ProductInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<SessionInfo>("/api/auth/me")
      .then((data) => {
        if (!cancelled) setMe(data.user);
      })
      .catch(() => undefined);
    api<{ products: ProductInfo[] }>("/api/products")
      .then((data) => {
        if (!cancelled && data.products.length > 0) setProducts(data.products);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = products.length > 0 ? products : FALLBACK_PRODUCTS;

  // 登录回跳：寻访产品进入新手向导，其余产品打开对应安装弹窗。
  useEffect(() => {
    const slug = searchParams.get("install");
    if (!slug || !loaded) return;
    const target = list.find((p) => p.slug === slug);
    if (target) {
      const timer = window.setTimeout(() => {
        if (target.slug === "soho-sourcing") {
          document.getElementById("install-center")?.scrollIntoView({ behavior: "smooth" });
        } else {
          setSelected(target);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loaded]);

  const sourcing = list.find((p) => p.slug === "soho-sourcing");

  return (
    <main className={styles.page}>
      <SiteHeader nav="minimal" />

      <section className={styles.hero}>
        <div className={styles.kicker}>
          <span /> HUNTER WORKS · 技能分发
        </div>
        <h1>
          猎头技能,
          <em>装进你的 Agent。</em>
        </h1>
        <p>
          不懂命令也没关系。跟着页面一步一步操作，就能把猎策装进你的 AI
          助手；职位与候选人数据仍留在你的电脑中。
        </p>
        <button className={styles.heroButton} onClick={() => document.getElementById("install-center")?.scrollIntoView({ behavior: "smooth" })}>
          开始安装
        </button>
      </section>

      <BeginnerInstallFlow product={sourcing} />

      <section className={styles.list} aria-label="技能列表">
        <div className={styles.listHeading}>
          <h2>可用技能</h2>
          <span>{list.length} SKILLS</span>
        </div>

        <div className={styles.cardGrid}>
          {list.map((product) => {
            const presentation = CARD_PRESENTATION[product.slug];
            const landing = LANDING_PAGES[product.slug];
            return (
              <article className={styles.card} key={product.slug}>
                <div className={styles.cardHead}>
                  <div className={styles.cardIcon}>
                    <Image src="/hunter-dog.svg" alt="" width={44} height={44} />
                  </div>
                  <div className={styles.cardTitle}>
                    <div className={styles.cardName}>
                      {landing ? (
                        <Link className={styles.cardNameLink} href={landing}>
                          <h3>{product.name}</h3>
                        </Link>
                      ) : (
                        <h3>{product.name}</h3>
                      )}
                      <span className={styles.cardSlug}>{product.slug}</span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span>Hunter 官方</span>
                      <small>
                        {product.latestRelease ? `v${product.latestRelease.version}` : "即将发布"}
                      </small>
                    </div>
                  </div>
                </div>
                <p className={styles.cardDesc}>{product.description}</p>
                {presentation && (
                  <ul className={styles.bullets}>
                    {presentation.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <div className={styles.cardFoot}>
                  {presentation && (
                    <div className={styles.includes}>
                      {presentation.includes.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <button
                    className={styles.installButton}
                    onClick={() => {
                      if (product.slug === "soho-sourcing") {
                        document.getElementById("install-center")?.scrollIntoView({ behavior: "smooth" });
                      } else {
                        setSelected(product);
                      }
                    }}
                  >
                    {product.slug === "soho-sourcing" ? "开始安装" : "安装"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 猎策 Hunter Works</span>
        <span>LOCAL / PRIVATE</span>
      </footer>

      {selected && (
        <InstallModal
          product={toModalProduct(selected)}
          me={me}
          onClose={() => setSelected(null)}
        />
      )}

    </main>
  );
}

function toModalProduct(p: ProductInfo): ModalProduct {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    isPublic: p.isPublic,
    latestRelease: p.latestRelease,
  };
}

export default function Home() {
  return (
    <Suspense>
      <DistributionPage />
    </Suspense>
  );
}
