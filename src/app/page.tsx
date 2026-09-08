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
  const [showRuntime, setShowRuntime] = useState(false);

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
          这里提供猎策官方技能包的安装与更新。技能运行在你本地的 Agent
          中,职位与候选人数据不离开你的电脑。
        </p>
      </section>

      <section className={styles.runtime} aria-label="运行环境">
        <div className={styles.listHeading}>
          <h2>运行环境</h2>
          <span>RUNTIME</span>
        </div>
        <div className={styles.runtimeCard}>
          <div className={styles.runtimeIcon}>⚙</div>
          <div className={styles.runtimeBody}>
            <h3>OpenCLI + LinkedIn 插件</h3>
            <p>
              寻访技能背后的数据采集引擎。安装「SOHO
              猎头人才寻访」时会自动一并安装,通常无需单独操作。
            </p>
          </div>
          <button className={styles.runtimeButton} onClick={() => setShowRuntime(true)}>
            查看安装
          </button>
        </div>
      </section>

      <section className={styles.list} aria-label="技能列表">
        <div className={styles.listHeading}>
          <h2>可用技能</h2>
          <span>{list.length} SKILLS</span>
        </div>

        <div className={styles.cardGrid}>
          {list.map((product) => {
            const presentation = CARD_PRESENTATION[product.slug];
            return (
              <article className={styles.card} key={product.slug}>
                <div className={styles.cardHead}>
                  <div className={styles.cardIcon}>
                    <Image src="/hunter-dog.svg" alt="" width={56} height={56} />
                  </div>
                  <div className={styles.cardMeta}>
                    <span>Hunter 官方</span>
                    <small>
                      {product.latestRelease ? `v${product.latestRelease.version}` : "即将发布"}
                    </small>
                  </div>
                </div>
                <h3>{product.name}</h3>
                <p className={styles.cardDesc}>{product.description}</p>
                {presentation && (
                  <>
                    <ul className={styles.bullets}>
                      {presentation.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <div className={styles.includes}>
                      {presentation.includes.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </>
                )}
                <button
                  className={styles.installButton}
                  onClick={() => setSelected(product)}
                >
                  安装
                </button>
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

      {showRuntime && (
        <RuntimeModal
          onClose={() => setShowRuntime(false)}
          onInstallSourcing={
            sourcing
              ? () => {
                  setShowRuntime(false);
                  setSelected(sourcing);
                }
              : undefined
          }
        />
      )}
    </main>
  );
}

function RuntimeModal({
  onClose,
  onInstallSourcing,
}: {
  onClose: () => void;
  onInstallSourcing?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const installPrompt = `请帮我安装猎策运行环境(OpenCLI + LinkedIn 插件)。

步骤:
1. 检查环境:终端里 node --version 需要 21 或更高。
2. 向我说明将要发生的变更(全局安装 opencli 命令行工具),取得我确认后继续。
3. 安装 OpenCLI:
   npm install -g @jackwener/opencli
4. 执行 opencli --version 确认可用。
5. LinkedIn 插件不单独分发,随「SOHO 猎头人才寻访」技能包安装——引导我到 ${typeof window !== "undefined" ? window.location.origin : "猎策分发站"} 安装该技能包,安装器会自动注册插件。
6. 完成后执行 opencli plugin list,确认列表里出现 hunter-linkedin。

如果任何一步失败,把报错原样告诉我。`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard.writeText(installPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className={styles.runtimeBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.runtimeModal} role="dialog" aria-modal="true" aria-labelledby="runtime-modal-title">
        <button className={styles.runtimeClose} onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 id="runtime-modal-title">OpenCLI + LinkedIn 插件</h2>
        <p className={styles.runtimeLead}>
          寻访技能的运行环境:OpenCLI 负责驱动浏览器,hunter-linkedin 插件提供
          LinkedIn 搜索、评估和报告命令。
        </p>

        <div className={styles.runtimeBlock}>
          <h3>怎么装</h3>
          <p>
            复制下面的 Prompt 发给你的 Agent(WorkBuddy / Claude Code /
            Codex),它会逐步完成安装。也可以直接安装「SOHO
            猎头人才寻访」技能包,运行环境会自动一并装好。
          </p>
          <div className={styles.runtimeCode}>
            <pre>{installPrompt}</pre>
            <button onClick={copy}>{copied ? "已复制" : "复制"}</button>
          </div>
          {onInstallSourcing && (
            <button className={styles.installButton} onClick={onInstallSourcing}>
              去安装寻访包
            </button>
          )}
        </div>

        <div className={styles.runtimeBlock}>
          <h3>怎么确认已装好</h3>
          <p>
            在终端执行 opencli plugin list,插件列表里出现 hunter-linkedin
            即正常;opencli --version 能显示版本号说明 OpenCLI 可用。
          </p>
        </div>

        <div className={styles.runtimeBlock}>
          <h3>什么时候需要重装</h3>
          <p>换新电脑、插件异常或 LinkedIn 页面结构升级导致采集失败时,重新安装一次寻访包即可修复。</p>
        </div>
      </section>
    </div>
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
