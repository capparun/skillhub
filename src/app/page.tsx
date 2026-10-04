"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "./components/site-header";
import { InstallModal, ModalProduct } from "./components/install-modal";
import { BeginnerInstallFlow } from "./components/beginner-install-flow";
import { api, SessionInfo } from "@/lib/client/api";
import { releaseLabel, type ReleaseState } from "@/lib/product-release";
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
    includes: ["职位需求对齐", "本地 Agent"],
  },
  "soho-sourcing": {
    bullets: [
      "LinkedIn 站内 + X-Ray 双通道搜索",
      "AI 匹配打分与候选人排序",
      "候选人初评与寻访报告输出",
    ],
    includes: ["LinkedIn 寻访工作流", "交付内容以安装包清单为准"],
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
  const [releaseState, setReleaseState] = useState<ReleaseState>("loading");
  const [installSlug, setInstallSlug] = useState("soho-sourcing");
  const [installPlatform, setInstallPlatform] = useState<"mac" | "windows">("mac");
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
        if (!cancelled) { setProducts(data.products); setReleaseState("ready"); }
      })
      .catch(() => { if (!cancelled) setReleaseState("error"); })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = releaseState === "ready" ? products : FALLBACK_PRODUCTS;

  // 登录回跳进入对应产品向导。
  useEffect(() => {
    const slug = searchParams.get("install");
    if (!slug || !loaded) return;
    const target = list.find((p) => p.slug === slug);
    if (target) {
      const timer = window.setTimeout(() => {
        setInstallSlug(target.slug);
        document.getElementById("install-center")?.scrollIntoView({ behavior: "smooth" });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loaded]);

  const installationProduct = list.find((p) => p.slug === installSlug) ?? list[0];

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
        <button className={styles.heroButton} onClick={() => document.querySelector('[aria-label="技能列表"]')?.scrollIntoView({ behavior: "smooth" })}>
          选择产品
        </button>
      </section>


      <section className={styles.list} aria-label="技能列表">
        <div className={styles.listHeading}>
          <h2>选择要安装的产品</h2>
          <span>{list.length} PRODUCTS</span>
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
                        {releaseLabel(releaseState, product.latestRelease)}
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
                      setInstallSlug(product.slug);
                      document.getElementById("install-center")?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    查看安装步骤
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <BeginnerInstallFlow key={installationProduct?.slug ?? "empty"} product={installationProduct} releaseState={releaseState} onInstall={(platform) => { setInstallPlatform(platform); if (installationProduct) setSelected(installationProduct); }} />

      <footer className={styles.footer}>
        <span>© 2026 猎策 Hunter Works</span>
        <span>LOCAL / PRIVATE</span>
      </footer>

      {selected && (
        <InstallModal
          product={toModalProduct(selected)}
          me={me}
          initialPlatform={installPlatform}
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
