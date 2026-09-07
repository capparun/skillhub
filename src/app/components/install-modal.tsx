"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, SessionInfo } from "@/lib/client/api";
import { freeInstallPrompt, freeCliCommand } from "@/lib/prompts";
import styles from "./install-modal.module.css";

export interface ModalProduct {
  slug: string;
  name: string;
  description?: string;
  isPublic: boolean;
  latestRelease: { version: string; sha256: string } | null;
}

interface PaidInstall {
  installPrompt: string;
  cliCommand: string;
  expiresAt: string;
}

interface InstallModalProps {
  product: ModalProduct;
  me: SessionInfo["user"] | null;
  /** 弹窗顶部介绍文案;缺省用产品描述。 */
  intro?: string;
  /** 三格事实卡;缺省为 运行方式 / 授权方式。 */
  facts?: { label: string; value: string }[];
  /** 未登录时「去登录」的跳转地址(含回跳参数)。 */
  loginHref?: string;
  onClose: () => void;
}

export function InstallModal({
  product,
  me,
  intro,
  facts,
  loginHref,
  onClose,
}: InstallModalProps) {
  const isFree = product.isPublic;
  const [installMode, setInstallMode] = useState<"agent" | "cli">("agent");
  const [copied, setCopied] = useState(false);
  const [paidInstall, setPaidInstall] = useState<PaidInstall | null>(null);
  const [paidError, setPaidError] = useState("");
  const [paidLoading, setPaidLoading] = useState(!isFree && !!me);
  const [now, setNow] = useState(() => Date.now());

  // 付费弹窗:登录后自动签发一次性安装令牌
  useEffect(() => {
    if (isFree || !me) return;
    let cancelled = false;
    api<PaidInstall>("/api/install-tokens", {
      method: "POST",
      body: { productSlug: product.slug },
    })
      .then((data) => {
        if (!cancelled) setPaidInstall(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPaidError(
            err instanceof ApiError ? err.message : "获取安装令牌失败,请稍后再试",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPaidLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isFree, me, product.slug]);

  // 令牌有效期倒计时
  useEffect(() => {
    if (!paidInstall) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [paidInstall]);

  // Esc 关闭 + 锁定背景滚动
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

  const tokenSecondsLeft = paidInstall
    ? Math.max(0, Math.floor((new Date(paidInstall.expiresAt).getTime() - now) / 1000))
    : 0;

  const freeInstallText = useMemo(() => {
    if (!isFree || !product.latestRelease) return "";
    const input = {
      appUrl: window.location.origin,
      productName: product.name,
      productSlug: product.slug,
      version: product.latestRelease.version,
      sha256: product.latestRelease.sha256,
    };
    return installMode === "agent" ? freeInstallPrompt(input) : freeCliCommand(input);
  }, [isFree, product, installMode]);

  const installText = isFree
    ? freeInstallText
    : paidInstall
      ? installMode === "agent"
        ? paidInstall.installPrompt
        : paidInstall.cliCommand
      : "";

  const copyInstall = async () => {
    await navigator.clipboard.writeText(installText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const displayFacts = facts ?? [
    { label: "运行方式", value: "本地 Agent" },
    { label: "授权方式", value: isFree ? "免费开放" : "年度授权" },
    { label: "交付方", value: "猎策 Hunter Works" },
  ];

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
      >
        <button className={styles.closeButton} onClick={onClose} aria-label="关闭">
          ×
        </button>

        <div className={styles.modalHeader}>
          <div className={styles.modalIcon}>
            <Image src="/hunter-dog.svg" alt="" width={82} height={82} />
          </div>
          <div>
            <span>
              {isFree ? "免费开放" : "专业版"} · Hunter 官方
              {product.latestRelease ? ` · v${product.latestRelease.version}` : ""}
            </span>
            <h2 id="install-modal-title">{product.name}</h2>
          </div>
        </div>

        <p className={styles.modalIntro}>
          {intro ?? product.description ?? ""}
          真实项目和数据始终在本地执行。
        </p>

        <div className={styles.modalFacts}>
          {displayFacts.map((fact) => (
            <div key={fact.label}>
              <small>{fact.label}</small>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className={styles.installSection}>
          <h3>安装方式</h3>
          <div className={styles.tabs} role="tablist" aria-label="安装方式">
            <button
              className={installMode === "agent" ? styles.activeTab : ""}
              onClick={() => {
                setInstallMode("agent");
                setCopied(false);
              }}
              role="tab"
              aria-selected={installMode === "agent"}
            >
              Agent 用户
            </button>
            <button
              className={installMode === "cli" ? styles.activeTab : ""}
              onClick={() => {
                setInstallMode("cli");
                setCopied(false);
              }}
              role="tab"
              aria-selected={installMode === "cli"}
            >
              命令行用户
            </button>
          </div>

          {isFree ? (
            freeInstallText ? (
              <div className={styles.installPanel}>
                <p>
                  {installMode === "agent"
                    ? "复制以下 Prompt 给你的 Agent,它会检查环境并在确认后完成免费安装。"
                    : "适合习惯使用终端的用户。在终端粘贴执行即可完成安装。"}
                </p>
                <div className={styles.codePanel}>
                  <pre>{installText}</pre>
                  <button onClick={copyInstall}>{copied ? "已复制" : "复制"}</button>
                </div>
                <div className={styles.compatibility}>
                  适用于可访问本地终端与文件的 Agent 环境,包括 WorkBuddy、Codex、
                  Claude Code 和 OpenClaw。
                </div>
              </div>
            ) : (
              <div className={styles.installPanel}>
                <p>安装包准备中,即将发布。请稍后再来看看。</p>
              </div>
            )
          ) : !me ? (
            <div className={styles.loginPanel}>
              <div>
                <span className={styles.lockIcon}>↳</span>
                <div>
                  <strong>登录后获取安装方式</strong>
                  <p>安装仅对已授权的付费用户开放。</p>
                </div>
              </div>
              <Link
                className={styles.primaryButton}
                href={loginHref ?? `/login?next=/?install=${product.slug}`}
              >
                去登录
              </Link>
              <small>账号由管理员开通;如需开通,请联系交付方。</small>
            </div>
          ) : paidLoading ? (
            <div className={styles.installPanel}>
              <p>正在校验授权并生成安装令牌…</p>
            </div>
          ) : paidError ? (
            <div className={styles.installPanel}>
              <p>{paidError}</p>
            </div>
          ) : paidInstall ? (
            <div className={styles.installPanel}>
              <p>
                {installMode === "agent"
                  ? "复制以下 Prompt 给你的 Agent,它会兑换令牌、校验安装包并完成安装。"
                  : "适合习惯使用终端的用户。在终端粘贴执行即可完成安装。"}
                <strong>
                  {" "}
                  令牌 {Math.floor(tokenSecondsLeft / 60)}:
                  {String(tokenSecondsLeft % 60).padStart(2, "0")} 后失效
                  {tokenSecondsLeft === 0 ? "(已失效,请关闭弹窗重新打开)" : ""}
                </strong>
              </p>
              <div className={styles.codePanel}>
                <pre>{installText}</pre>
                <button onClick={copyInstall}>{copied ? "已复制" : "复制"}</button>
              </div>
              <div className={styles.compatibility}>
                适用于可访问本地终端与文件的 Agent 环境,包括 WorkBuddy、Codex、
                Claude Code 和 OpenClaw。
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
