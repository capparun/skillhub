"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "./components/site-header";
import { InstallModal, ModalProduct } from "./components/install-modal";
import { api, SessionInfo } from "@/lib/client/api";
import styles from "./page.module.css";

interface ProductInfo {
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  latestRelease: { version: string; sha256: string } | null;
}

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
    isPublic: false,
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

  // 登录回跳:/login?next=/?install=<slug> → 自动打开对应技能的安装弹窗
  useEffect(() => {
    const slug = searchParams.get("install");
    if (!slug || !loaded) return;
    const target = list.find((p) => p.slug === slug);
    if (target) {
      const timer = window.setTimeout(() => setSelected(target), 0);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loaded]);

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
          这里提供猎策官方技能包的安装与更新。技能运行在你本地的 Agent
          中,职位与候选人数据不离开你的电脑。
        </p>
      </section>

      <section className={styles.list} aria-label="技能列表">
        <div className={styles.listHeading}>
          <h2>可用技能</h2>
          <span>{list.length} SKILLS</span>
        </div>

        {list.map((product) => (
          <article className={styles.card} key={product.slug}>
            <div className={styles.cardIcon}>
              <Image src="/hunter-dog.svg" alt="" width={64} height={64} />
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardMeta}>
                <span className={product.isPublic ? styles.badgeFree : styles.badgePro}>
                  {product.isPublic ? "免费开放" : "专业版"}
                </span>
                <span>Hunter 官方</span>
              </div>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
            </div>
            <div className={styles.cardAside}>
              <small>
                {product.latestRelease ? `v${product.latestRelease.version}` : "即将发布"}
              </small>
              <button
                className={styles.installButton}
                onClick={() => setSelected(product)}
              >
                {product.isPublic ? "免费安装" : "获取安装"}
              </button>
            </div>
          </article>
        ))}
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
