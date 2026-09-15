"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  freeInstallPrompt,
  freeCliCommand,
  windowsCliCommand,
  windowsFreeInstallPrompt,
} from "@/lib/prompts";
import styles from "./beginner-install-flow.module.css";

interface InstallProduct {
  slug: string;
  name: string;
  latestRelease: { version: string; sha256: string } | null;
}

const steps = ["选择电脑", "安装 OpenCLI", "连接 Chrome", "确认 LinkedIn", "安装猎策", "完成验证"];

export function BeginnerInstallFlow({ product }: { product?: InstallProduct }) {
  const [step, setStep] = useState(0);
  const [os, setOs] = useState<"mac" | "windows" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOrigin(window.location.origin);
      const platform = [navigator.userAgent, navigator.platform].join(" ").toLowerCase();
      if (platform.includes("win")) setOs("windows");
      else if (platform.includes("mac")) setOs("mac");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const installPrompt = useMemo(() => {
    if (!product) return "正在获取猎策发布信息，请稍候……";
    if (!product.latestRelease) return "当前没有可安装的已发布版本。请联系管理员在后台发布 Hunter 安装包后，再回到此页面继续。";
    if (!origin) return "正在准备安装地址，请稍候……";
    const input = {
      appUrl: origin,
      productName: product.name,
      productSlug: product.slug,
      version: product.latestRelease.version,
      sha256: product.latestRelease.sha256,
    };
    return os === "windows" ? windowsFreeInstallPrompt(input) : freeInstallPrompt(input);
  }, [origin, os, product]);

  const terminalCommand = useMemo(() => {
    if (!product || !origin) return "";
    const input = { appUrl: origin, productSlug: product.slug };
    if (!os) return "";
    return os === "windows" ? windowsCliCommand(input) : freeCliCommand(input);
  }, [origin, os, product]);

  function go(next: number) {
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
    setConfirmed(false);
    requestAnimationFrame(() => document.getElementById("install-center")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("error");
    }
  }

  const opencliInstallPrompt = `请帮我安装 Hunter 所需的 OpenCLI，不要跳过任何验证：
1. 先运行 node --version；OpenCLI 需要 Node.js 20 或更高版本。若版本不够或未安装，请先说明要安装什么，等我确认后再继续。
2. 安装 OpenCLI：npm install -g @jackwener/opencli
3. 安装后运行 opencli --version，确认命令真实可用。
4. 把 Node.js 版本和 OpenCLI 版本的真实输出发给我。`;
  const browserConnectPrompt = `请帮我检查 OpenCLI 是否已经连接 Chrome 浏览器：
1. 运行 opencli doctor。
2. 根据真实输出确认 Chrome 扩展和浏览器连接是否正常，不要只回复“已连接”。
3. 如果检查失败，请告诉我具体是哪一项失败，并一步一步指导我处理。
4. 检查完成后，把 opencli doctor 的真实结果发给我。`;
  const linkedinPrompt = "请执行 opencli linkedin whoami -f json，确认是否能真实读取我当前登录的 LinkedIn 账号。不要修改任何数据。如果失败，请判断是未登录、Chrome 扩展未启用，还是 OpenCLI 未连接浏览器。";

  return <section className={styles.section} id="install-center" aria-labelledby="install-heading">
    <header className={styles.heading}>
      <span>新手安装</span>
      <h2 id="install-heading">跟着 6 步，完成猎策安装</h2>
      <p>每一步都告诉你做什么、看到什么才算成功。预计需要 3–5 分钟。</p>
    </header>
    <div className={styles.frame}>
      <nav className={styles.sidebar} aria-label="安装步骤">
        <strong>安装完整寻访</strong>
        <ol>{steps.map((label, index) => <li key={label} className={index === step ? styles.active : stepClass(index, step)}><button onClick={() => index <= step && go(index)} disabled={index > step}><span>{index < step ? "✓" : index + 1}</span>{label}</button></li>)}</ol>
        <div className={styles.progress}><span style={{ width: `${step / (steps.length - 1) * 100}%` }} /></div>
        <small>进度 {Math.round(step / (steps.length - 1) * 100)}%</small>
      </nav>
      <div className={styles.content}>
        {step === 0 && <Step tag="第 1 步，共 6 步" title="你使用什么电脑？" lead={os ? `已自动识别为 ${os === "mac" ? "macOS" : "Windows"}；如不正确可手动切换。` : "正在识别系统，也可以手动选择。"}>
          <div className={styles.choices}><button className={os === "mac" ? styles.selected : ""} onClick={() => setOs("mac")}><strong>macOS</strong><span>苹果 MacBook、iMac 等</span></button><button className={os === "windows" ? styles.selected : ""} onClick={() => setOs("windows")}><strong>Windows</strong><span>Windows 10 或 Windows 11</span></button></div>
          <Info title="推荐交给 AI 助手安装">不用自己输入命令。WorkBuddy、Codex、Claude Code 都可以。</Info>
        </Step>}
        {step === 1 && <Step tag="第 2 步，共 6 步" title="安装 OpenCLI" lead="OpenCLI 是猎策连接 LinkedIn 的基础工具；这一阶段必须先把它装好。">
          <Info title="会安装什么？">先确认 Node.js 20 或更高版本，再执行 <code>npm install -g @jackwener/opencli</code> 安装 OpenCLI。</Info>
          <CopyBox text={opencliInstallPrompt} copied={copied === "opencli"} onCopy={() => copy("opencli", opencliInstallPrompt)} />
          <Check checked={confirmed} onChange={setConfirmed} title="AI 已返回 OpenCLI 的真实版本号">必须看到 <code>opencli --version</code> 的真实输出；只说“已安装”不算完成。</Check>
          <Help>如果没有 AI 助手，请在 {os === "windows" ? "Windows PowerShell" : "macOS 终端"}运行上面的安装命令；遇到权限或 Node.js 版本问题，把完整报错交给 AI 处理。</Help>
        </Step>}
        {step === 2 && <Step tag="第 3 步，共 6 步" title="连接 Chrome 浏览器" lead="猎策通过 OpenCLI 扩展使用你已经登录的网站。">
          <Info title="1. 安装 OpenCLI Chrome 扩展"><a href="https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk" target="_blank" rel="noreferrer">打开 Chrome 应用商店 ↗</a></Info>
          <Info title="2. 确认扩展已启用">在 Chrome 右上角的扩展菜单中，确认能看到 OpenCLI 图标。</Info>
          <Info title="3. 让 AI 帮你检查连接">复制下面这段话发给你的 AI 助手，它会替你运行检查并告诉你结果。</Info>
          <CopyBox text={browserConnectPrompt} copied={copied === "browser"} onCopy={() => copy("browser", browserConnectPrompt)} />
          <Check checked={confirmed} onChange={setConfirmed} title="AI 已告诉我浏览器连接正常">必须看到 AI 返回的真实检查结果；只说“应该可以”不算完成。</Check>
          <Help>没有 AI 助手时，才需要在终端运行 <code>opencli doctor</code>。如果 Chrome 商店打不开、扩展未启用或图标不见了，请先处理这些问题。</Help>
        </Step>}
        {step === 3 && <Step tag="第 4 步，共 6 步" title="确认 LinkedIn 登录" lead="先在 Chrome 中登录 LinkedIn，再做一次真实账号读取。">
          <CopyBox text={linkedinPrompt} copied={copied === "linkedin"} onCopy={() => copy("linkedin", linkedinPrompt)} />
          <Check checked={confirmed} onChange={setConfirmed} title="AI 已返回我的 LinkedIn 账号信息">必须显示真实账号信息，只有“命令执行成功”不算完成。</Check>
          <Help>读取失败时，依次检查 LinkedIn 登录、Chrome 扩展和 OpenCLI 浏览器连接。</Help>
        </Step>}
        {step === 4 && <Step tag="第 5 步，共 6 步" title="安装猎策寻访能力" lead={product?.latestRelease ? "安装职位梳理、LinkedIn 寻访和候选人报告。" : "当前站点尚无已发布的 Hunter 安装包，发布后才能继续安装。"}>
          {product?.latestRelease ? <>
            <CopyBox text={installPrompt} copied={copied === "hunter"} onCopy={() => copy("hunter", installPrompt)} />
            <button className={styles.advanced} onClick={() => setAdvanced(!advanced)}>{advanced ? "收起手动安装" : "我想自己用终端安装（高级）"}</button>
            {advanced && <div className={styles.command}>{terminalCommand}</div>}
            <Check checked={confirmed} onChange={setConfirmed} title="Hunter doctor 显示全部通过">插件和 3 个 Skill 都必须显示 ✓。</Check>
            <Help>安装失败时，把完整报错交给 AI，不要跳过 doctor，也不要反复安装。</Help>
          </> : <Info title="等待安装包发布">这不是你的电脑或 OpenCLI 的问题。管理员需在发布后台上传并发布 Hunter 安装包；发布后刷新本页即可继续。</Info>}
        </Step>}
        {step === 5 && <Step tag="安装完成" title="猎策已经准备好了" lead="环境、浏览器、LinkedIn 和 Hunter Skill 均已完成验证。">
          <ul className={styles.results}><li>✓ Node.js 20+</li><li>✓ OpenCLI 已安装并返回版本号</li><li>✓ Chrome 扩展与 opencli doctor</li><li>✓ LinkedIn 真实账号连接</li><li>✓ Hunter 插件和 3 个 Skill</li></ul>
          <p>现在把一份 JD 发给 AI，然后说：</p><CopyBox text="帮我梳理这个职位，并在 LinkedIn 上寻找合适的候选人。" copied={copied === "start"} onCopy={() => copy("start", "帮我梳理这个职位，并在 LinkedIn 上寻找合适的候选人。")} />
        </Step>}
        {copied === "error" && <p className={styles.copyError}>复制失败，请手动选中文字复制。</p>}
        <footer className={styles.actions}>{step > 0 && step < 5 && <button className={styles.back} onClick={() => go(step - 1)}>上一步</button>}{step < 5 && <button className={styles.next} disabled={(step === 0 && !os) || (step > 0 && !confirmed) || (step === 4 && !product?.latestRelease)} onClick={() => go(step + 1)}>{step === 0 ? "继续" : "我已完成，继续"}</button>}{step === 5 && <button className={styles.back} onClick={() => go(0)}>重新检查安装</button>}</footer>
      </div>
    </div>
  </section>;
}

function stepClass(index: number, step: number) { return index < step ? styles.done : ""; }
function Step({ tag, title, lead, children }: { tag: string; title: string; lead?: string; children: ReactNode }) { return <div><span className={styles.tag}>{tag}</span><h3>{title}</h3>{lead && <p className={styles.lead}>{lead}</p>}{children}</div>; }
function Info({ title, children }: { title: string; children: ReactNode }) { return <div className={styles.info}><strong>{title}</strong><p>{children}</p></div>; }
function CopyBox({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) { return <div className={styles.copyBox}><p>{text}</p><button onClick={onCopy}>{copied ? "已复制 ✓" : "复制给 AI"}</button></div>; }
function Check({ checked, onChange, title, children }: { checked: boolean; onChange: (value: boolean) => void; title: string; children: ReactNode }) { return <label className={styles.check}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span><strong>{title}</strong><small>{children}</small></span></label>; }
function Help({ children }: { children: ReactNode }) { return <details className={styles.help}><summary>遇到问题？</summary><p>{children}</p></details>; }
