"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { InstallModal, ModalProduct } from "../components/install-modal";
import { api, SessionInfo } from "@/lib/client/api";
import styles from "./page.module.css";

type SkillId = "align" | "sourcing";

const PRODUCT_SLUGS: Record<SkillId, string> = {
  align: "hunter-align",
  sourcing: "soho-sourcing",
};

interface ProductInfo {
  slug: string;
  name: string;
  isPublic: boolean;
  latestRelease: { version: string; sha256: string } | null;
}

// 弹窗展示文案与接口失败时的兜底产品信息
const SKILL_PRESENTATION: Record<
  SkillId,
  { fallback: ModalProduct; intro: string; facts: { label: string; value: string }[] }
> = {
  align: {
    fallback: {
      slug: "hunter-align",
      name: "职位需求对齐",
      isPublic: true,
      latestRelease: null,
    },
    intro:
      "从 JD 诊断、关键追问到人才画像和寻访任务书,把需求真正对齐后再开始找人。",
    facts: [
      { label: "主要产出", value: "寻访任务书" },
      { label: "运行方式", value: "本地 Agent" },
      { label: "授权方式", value: "免费开放" },
    ],
  },
  sourcing: {
    fallback: {
      slug: "soho-sourcing",
      name: "SOHO 猎头人才寻访",
      isPublic: false,
      latestRelease: null,
    },
    intro:
      "接着已经对齐的职位需求,在 LinkedIn 开展寻访、候选人初评和报告输出。",
    facts: [
      { label: "覆盖渠道", value: "LinkedIn" },
      { label: "运行方式", value: "本地 Agent" },
      { label: "授权方式", value: "年度授权" },
    ],
  },
};

const upcomingSkills = [
  {
    glyph: "评",
    eyebrow: "甄选评估",
    title: "候选人深度评估",
    description: "从硬性门槛到推荐理由,形成可复核的候选人判断。",
    tone: "sand",
  },
  {
    glyph: "脉",
    eyebrow: "渠道扩展",
    title: "脉脉人才寻访",
    description: "面向本土技术人才网络的搜索、筛选与结果整理。",
    tone: "lavender",
  },
  {
    glyph: "图",
    eyebrow: "项目洞察",
    title: "人才地图与复盘",
    description: "沉淀目标公司、人才分布与项目经验,形成可复用资产。",
    tone: "mint",
  },
];

export default function Landing() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillId>("align");
  const [me, setMe] = useState<SessionInfo["user"] | null>(null);
  const [products, setProducts] = useState<Record<string, ProductInfo>>({});

  useEffect(() => {
    api<SessionInfo>("/api/auth/me")
      .then((data) => setMe(data.user))
      .catch(() => setMe(null));
    api<{ products: ProductInfo[] }>("/api/products")
      .then((data) =>
        setProducts(Object.fromEntries(data.products.map((p) => [p.slug, p]))),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") !== "1") return;

    const timer = window.setTimeout(() => {
      setSelectedSkill("sourcing");
      setDetailOpen(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const openInstall = (skill: SkillId) => {
    setSelectedSkill(skill);
    setDetailOpen(true);
  };

  const alignVersion = products[PRODUCT_SLUGS.align]?.latestRelease?.version;
  const presentation = SKILL_PRESENTATION[selectedSkill];
  const modalProduct: ModalProduct = {
    ...presentation.fallback,
    ...products[PRODUCT_SLUGS[selectedSkill]],
  };

  return (
    <main className={styles.page}>
      <SiteHeader />

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>
            <span /> HUNTER WORKS · 官方工作流
          </div>
          <h1>
            把猎头 <span className={styles.noWrap}>Know-how</span>,
            <em>装进你的 Agent。</em>
          </h1>
          <p>
            面向 SOHO 猎头的需求对齐与人才寻访工作流。安装到你自己的
            Agent,在本地完成真实项目。
          </p>
          <div className={styles.heroActions}>
            <button className={styles.primaryButton} onClick={() => openInstall("align")}>
              免费安装需求对齐 <span>↗</span>
            </button>
            <a className={styles.textLink} href="#how">
              了解工作方式
            </a>
          </div>
        </div>
        <div className={styles.heroArtifact} aria-label="Hunter 工作流示意">
          <div className={styles.artifactTopline}>
            <span>JOB ALIGNMENT / FREE</span>
            <span className={styles.liveDot}>免费</span>
          </div>
          <Image
            className={styles.artifactDog}
            src="/hunter-dog.svg"
            alt=""
            width={112}
            height={112}
          />
          <div className={styles.workflowRail}>
            <div>
              <span>01</span>
              <strong>JD 诊断</strong>
              <small>找出信息缺口与条件矛盾</small>
            </div>
            <div>
              <span>02</span>
              <strong>关键追问</strong>
              <small>厘清业务场景与真实要求</small>
            </div>
            <div>
              <span>03</span>
              <strong>寻访任务书</strong>
              <small>人才画像、搜索方向与优先级</small>
            </div>
          </div>
          <div className={styles.artifactNote}>
            <span>LOCAL FIRST</span>
            JD、客户需求和对齐结果始终留在你的电脑中。
          </div>
        </div>
      </section>

      <section className={styles.catalog} id="skills">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionIndex}>01 / SKILLS</span>
            <h2>从一个真实职位开始</h2>
          </div>
          <p>按猎头业务能力组织,而不是让你理解工具和命令。</p>
        </div>

        <article className={styles.featuredCard}>
          <div className={styles.featuredIcon}>
            <Image src="/hunter-dog.svg" alt="" width={78} height={78} />
          </div>
          <div className={styles.featuredBody}>
            <div className={styles.cardMeta}>
              <span className={styles.availableBadge}>免费开放</span>
              <span>无需登录 · Hunter 官方</span>
            </div>
            <h3>职位需求对齐</h3>
            <p>
              把一份真实 JD 交给 Agent,通过关键追问厘清隐含要求,形成可直接用于寻访的
              人才画像和任务书。
            </p>
            <ul className={styles.skillTags} aria-label="包含能力">
              <li>JD 诊断</li>
              <li>关键追问</li>
              <li>人才画像</li>
              <li>搜索方向</li>
              <li>寻访任务书</li>
            </ul>
          </div>
          <div className={styles.featuredAside}>
            <div>
              <small>当前版本</small>
              <strong>{alignVersion ? `v${alignVersion}` : "即将发布"}</strong>
            </div>
            <button onClick={() => openInstall("align")}>免费安装</button>
          </div>
        </article>

        <article className={styles.proCard}>
          <div className={styles.proIndex}>PRO / 01</div>
          <div className={styles.proBody}>
            <div className={styles.proMeta}>专业版 · 年度授权</div>
            <h3>SOHO 猎头人才寻访</h3>
            <p>
              接着已经对齐的需求,在 LinkedIn 发现候选人,完成匹配判断、排序和寻访报告。
            </p>
          </div>
          <ul className={styles.proCapabilities} aria-label="专业版能力">
            <li>LinkedIn 寻访</li>
            <li>候选人初评</li>
            <li>匹配排序</li>
            <li>寻访报告</li>
          </ul>
          <button onClick={() => openInstall("sourcing")}>查看专业版</button>
        </article>

        <div className={styles.upcomingGrid}>
          {upcomingSkills.map((skill) => (
            <article className={`${styles.skillCard} ${styles[skill.tone]}`} key={skill.title}>
              <div className={styles.skillCardTop}>
                <span className={styles.smallGlyph}>{skill.glyph}</span>
                <span className={styles.soonBadge}>即将上线</span>
              </div>
              <small>{skill.eyebrow}</small>
              <h3>{skill.title}</h3>
              <p>{skill.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.how} id="how">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionIndex}>02 / HOW IT WORKS</span>
            <h2>安装一次,项目留在本地</h2>
          </div>
        </div>
        <div className={styles.steps}>
          <article>
            <span>01</span>
            <h3>选择能力</h3>
            <p>查看业务场景、适用范围和示例,找到适合自己的工作流。</p>
          </article>
          <article>
            <span>02</span>
            <h3>交给 Agent 安装</h3>
            <p>复制安装 Prompt。Agent 先检查环境并说明变更,经确认后再安装。</p>
          </article>
          <article>
            <span>03</span>
            <h3>直接开始项目</h3>
            <p>在自己的 Agent 中粘贴 JD,Hunter 会追问、对齐并推进寻访。</p>
          </article>
        </div>
        <div className={styles.privacyStrip}>
          <strong>你的项目,不进入我们的云端。</strong>
          <span>本站只负责展示、授权、安装和更新。</span>
          <span className={styles.privacySeal}>LOCAL / PRIVATE</span>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <Image className={styles.brandLogo} src="/hunter-dog.svg" alt="" width={48} height={48} />
          <span>
            <strong>猎策</strong>
            <small>HUNTER WORKS</small>
          </span>
        </div>
        <p>为独立猎头打造的本地 Agent 工作流。</p>
        <span>© 2026 猎策</span>
      </footer>

      {detailOpen && (
        <InstallModal
          product={modalProduct}
          me={me}
          intro={presentation.intro}
          facts={presentation.facts}
          loginHref="/login?next=/landing?login=1"
          onClose={() => setDetailOpen(false)}
        />
      )}
    </main>
  );
}
