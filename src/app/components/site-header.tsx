"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, SessionInfo } from "@/lib/client/api";
import styles from "./site-header.module.css";

type SiteHeaderProps = {
  active?: "guide";
  /** full:完整营销站导航(用于 /landing);minimal:仅保留新手入门,隐藏登录入口;none:完全无导航(引流落地页闭环)。 */
  nav?: "full" | "minimal" | "none";
  /** false 时品牌区渲染为纯文本不可点击(用于引流落地页,避免免费流量发现分发首页与付费技能)。 */
  brandLinked?: boolean;
};

export function SiteHeader({ active, nav = "full", brandLinked = true }: SiteHeaderProps) {
  const router = useRouter();
  const [me, setMe] = useState<SessionInfo["user"] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<SessionInfo>("/api/auth/me")
      .then((data) => setMe(data.user))
      .catch(() => setMe(null))
      .finally(() => setLoaded(true));
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setMe(null);
    router.push("/");
    router.refresh();
  };

  const brand = (
    <>
      <Image className={styles.brandLogo} src="/hunter-dog.svg" alt="" width={48} height={48} />
      <span>
        <strong>猎策</strong>
        <small>HUNTER WORKS</small>
      </span>
    </>
  );

  return (
    <header className={styles.header}>
      {brandLinked ? (
        <Link className={styles.brand} href="/" aria-label="猎策 Hunter Works 首页">
          {brand}
        </Link>
      ) : (
        <span className={styles.brand}>{brand}</span>
      )}

      {nav !== "none" && (
        <nav className={styles.nav} aria-label="主导航">
          {nav === "full" && <Link href="/landing#skills">猎头工作流</Link>}
          <Link className={active === "guide" ? styles.activeNav : undefined} href="/guide" aria-current={active === "guide" ? "page" : undefined}>
            新手入门
          </Link>
          {nav === "full" &&
            (loaded && me ? (
              <>
                {me.role === "admin" && <Link href="/admin">管理后台</Link>}
                <Link href="/account">{me.displayName || me.email}</Link>
                <button className={styles.loginButton} type="button" onClick={logout}>
                  退出
                </button>
              </>
            ) : (
              <Link className={styles.loginButton} href="/login">
                <span className={styles.loginLabelLong}>登录</span>
                <span className={styles.loginLabelShort}>登录</span>
              </Link>
            ))}
        </nav>
      )}
    </header>
  );
}
