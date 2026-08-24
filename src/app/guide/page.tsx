import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "../components/site-header";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "新手指南｜什么是 Agent 和 Skill｜猎策",
  description: "用简单语言了解 Agent、Skill，以及 Hunter Skills 如何用于 WorkBuddy、Codex、Claude Code 和 OpenClaw。",
};

const agents = [
  { logo: "/agents/workbuddy.png", name: "WorkBuddy", note: "直接把安装提示词发给它" },
  { logo: "/agents/codex.svg", name: "Codex", note: "由 Codex 检查并完成本地安装" },
  { logo: "/agents/claude.svg", name: "Claude Code", note: "由 Claude Code 选择正确目录安装" },
  { logo: "/agents/openclaw.svg", name: "OpenClaw", note: "通过本地能力目录加载同一套 Skill" },
];

const faqs = [
  {
    question: "我需要同时安装四个 Agent 吗？",
    answer: "不需要。选择你现在正在使用的一个就可以。Hunter Skill 会由安装助手适配当前环境。",
  },
  {
    question: "Skill 是一个新的 AI 软件吗？",
    answer: "不是。Skill 更像一套可以安装的专业工作方法，需要放进 Agent 中使用。",
  },
  {
    question: "安装以后还需要一直打开这个网站吗？",
    answer: "不需要。安装完成后直接在自己的 Agent 中使用；网站只负责展示、安装和更新。",
  },
  {
    question: "我的 JD 和候选人资料会上传吗？",
    answer: "不会上传到猎策。Hunter Skill 在你的本地 Agent 中执行，业务资料和执行结果留在你的电脑里。",
  },
  {
    question: "免费 Skill 和专业版有什么区别？",
    answer: "免费的职位需求对齐帮助你把 JD 变成寻访任务书；专业版继续完成多渠道寻访、初评和报告。",
  },
];

export default function GuidePage() {
  return (
    <main className={styles.page}>
      <SiteHeader active="guide" />

      <section className={styles.hero}>
        <div className={styles.eyebrow}>第一次使用 Agent？从这里开始</div>
        <h1>
          把你的猎头方法，
          <em>交给 AI 反复照做。</em>
        </h1>
        <p>
          不需要懂编程，也不需要每次重新教一遍。选择一个 Skill，把安装提示词交给正在使用的
          Agent，它以后就能按照同一套方法完成任务。
        </p>
      </section>

      <section className={styles.concepts} aria-labelledby="concept-title">
        <div className={styles.sectionTitle}>
          <span>01 / 两个概念</span>
          <h2 id="concept-title">Agent 和 Skill 到底是什么？</h2>
        </div>

        <div className={styles.analogy}>
          <article className={styles.conceptCard}>
            <div className={styles.conceptNumber}>A</div>
            <div>
              <small>AGENT</small>
              <h3>会理解、判断和行动的 AI 助手</h3>
              <p>
                它不只回答问题，还可以读取文件、整理资料、打开网页并按步骤完成任务。
                WorkBuddy、Codex、Claude Code 和 OpenClaw 都属于 Agent。
              </p>
            </div>
          </article>

          <div className={styles.plus}>＋</div>

          <article className={styles.conceptCard}>
            <div className={styles.conceptNumber}>S</div>
            <div>
              <small>SKILL</small>
              <h3>交给 Agent 的专业方法和作业流程</h3>
              <p>
                Skill 告诉 Agent 什么时候追问、如何判断、按什么顺序工作，以及最终应该交付什么。
                它不是一句“你是顶级专家”的临时提示词，而是一套可以反复使用的猎头 SOP。
              </p>
            </div>
          </article>
        </div>

        <div className={styles.resultLine}>
          <span>简单理解</span>
          <strong>Agent 是会做事的人，Skill 是它掌握的专业技能。</strong>
        </div>

        <div className={styles.skillFormula}>
          <small>一个可靠的 Skill 通常包含</small>
          <p>
            <span>特定任务</span><b>＋</b><span>专业流程</span><b>＋</b><span>输入要求</span><b>＋</b>
            <span>输出标准</span><b>＋</b><span>风险边界</span>
          </p>
        </div>
      </section>

      <section className={styles.anatomy} aria-labelledby="anatomy-title">
        <div className={styles.sectionTitle}>
          <span>02 / 长什么样</span>
          <h2 id="anatomy-title">Skill 本质上是一个小文件夹</h2>
          <p>
            文件夹里最重要的是 `SKILL.md`。它写清楚这个 Skill 什么时候使用、需要怎样执行，以及什么样的结果才算完成。
          </p>
        </div>

        <div className={styles.anatomyGrid}>
          <div className={styles.folderPreview}>
            <div className={styles.folderTitle}>
              <span>▾</span> hunter-align/
            </div>
            <div className={styles.fileRow}>
              <strong>SKILL.md</strong>
              <span>必需 · 核心说明书</span>
            </div>
            <div className={styles.fileRow}>
              <strong>references/</strong>
              <span>可选 · 规则与案例</span>
            </div>
            <div className={styles.fileRow}>
              <strong>scripts/</strong>
              <span>可选 · 自动处理脚本</span>
            </div>
            <p>初学者只需要记住：一个文件夹，加一份写清楚方法的 `SKILL.md`。</p>
          </div>

          <div className={styles.skillPreview} aria-label="职位需求对齐 Skill 示例">
            <div className={styles.previewBar}>
              <strong>SKILL.md</strong>
              <span>职位需求对齐</span>
            </div>
            <pre>{`name: hunter-align
description: 当用户需要澄清 JD、
对齐职位需求或建立人才画像时使用。

# 怎么做
1. 检查 JD 的信息缺口与条件矛盾
2. 针对关键问题逐项追问
3. 形成候选人画像和搜索方向

# 输出标准
交付一份可以直接寻访的任务书

# 风险边界
不把推测写成客户已经确认的事实`}</pre>
          </div>
        </div>

        <div className={styles.relationshipMap} aria-label="用户、Agent、Skill、工具和结果之间的关系">
          <div>
            <small>你</small>
            <strong>提出真实任务</strong>
          </div>
          <span>→</span>
          <div className={styles.agentNode}>
            <small>Agent</small>
            <strong>理解并组织行动</strong>
          </div>
          <span>→</span>
          <div>
            <small>Skill</small>
            <strong>提供专业流程</strong>
          </div>
          <span>→</span>
          <div>
            <small>已授权工具</small>
            <strong>执行具体动作</strong>
          </div>
          <span>→</span>
          <div>
            <small>结果</small>
            <strong>按标准检查交付</strong>
          </div>
        </div>
      </section>

      <section className={styles.activation} aria-labelledby="activation-title">
        <div className={styles.sectionTitle}>
          <span>03 / 如何工作</span>
          <h2 id="activation-title">Skill 不会自己干活，Agent 才会</h2>
          <p>
            Skill 负责规定方法，Agent 负责理解你的任务，并调用当前环境中已经获得授权的文件、网页和其他工具。
          </p>
        </div>

        <div className={styles.activationFlow}>
          <article>
            <span>01</span>
            <h3>先判断是否相关</h3>
            <p>Agent 平时只看到 Skill 的名称和用途说明，不会一次读入全部内容。</p>
          </article>
          <article>
            <span>02</span>
            <h3>匹配后读取方法</h3>
            <p>当你提出相关任务，Agent 才加载完整流程、规则和交付要求。</p>
          </article>
          <article>
            <span>03</span>
            <h3>调用已有工具</h3>
            <p>需要读文件、查网页或运行命令时，只使用当前 Agent 已授权的能力。</p>
          </article>
          <article>
            <span>04</span>
            <h3>检查后交付</h3>
            <p>按照 Skill 的验收条件核对结果，说明完成内容和仍然存在的边界。</p>
          </article>
        </div>

        <div className={styles.toolBoundary}>
          <strong>所以：</strong>
          Skill 本身不会登录网站、读取文件或发送消息；它只能指导 Agent 使用你已经允许的工具。
        </div>
      </section>

      <section className={styles.compatibility} aria-labelledby="compatibility-title">
        <div className={styles.sectionTitle}>
          <span>04 / 兼容性</span>
          <h2 id="compatibility-title">选一个你习惯的 Agent 就可以</h2>
          <p>
            本站发布的 Hunter 官方 Skills 使用同一份内容和版本，并针对以下 Agent 的安装方式做了适配。
          </p>
        </div>

        <div className={styles.agentGrid}>
          {agents.map((agent) => (
            <article key={agent.name}>
              <div className={styles.agentMark}>
                <Image src={agent.logo} alt={`${agent.name} logo`} width={45} height={45} />
              </div>
              <h3>{agent.name}</h3>
              <p>{agent.note}</p>
              <span>支持</span>
            </article>
          ))}
        </div>

        <div className={styles.compatibilityNote}>
          <strong>需要说明：</strong>
          Agent Skills 是以 `SKILL.md` 为核心的开放目录格式。不同客户端主要区别在安装位置和可用工具，
          不是 Skill 的专业内容。这里承诺兼容的是猎策发布的 Hunter 官方 Skills。
        </div>
      </section>

      <section className={styles.install} aria-labelledby="install-title">
        <div className={styles.sectionTitle}>
          <span>05 / 怎么开始</span>
          <h2 id="install-title">第一次安装，只要四步</h2>
        </div>

        <ol className={styles.installSteps}>
          <li>
            <span>01</span>
            <div>
              <h3>选择一个 Skill</h3>
              <p>建议从免费的“职位需求对齐”开始。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>复制安装提示词</h3>
              <p>不用理解里面的命令，整段复制即可。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>发送给你的 Agent</h3>
              <p>Agent 会先检查环境，并告诉你准备修改什么。</p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>确认后开始使用</h3>
              <p>安装完成后，把一份真实 JD 发给 Agent。</p>
            </div>
          </li>
        </ol>

        <div className={styles.safetyNote}>
          <div>
            <small>安装原则</small>
            <strong>Agent 先说明变更，得到你的确认后才会安装。</strong>
          </div>
          <div>
            <small>使用原则</small>
            <strong>Skill 使用过程不需要与猎策云端交互。</strong>
          </div>
        </div>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title">
        <div className={styles.sectionTitle}>
          <span>06 / 常见问题</span>
          <h2 id="faq-title">你可能还想知道</h2>
        </div>
        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <details key={faq.question} open={index === 0}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <Image src="/hunter-dog-mark.svg" alt="" width={130} height={130} />
        <div>
          <small>READY TO START</small>
          <h2>从一份真实 JD 开始。</h2>
          <p>职位需求对齐永久免费，安装后直接在你的 Agent 中使用。</p>
        </div>
        <Link href="/#skills">免费安装需求对齐 <span>↗</span></Link>
      </section>
    </main>
  );
}
