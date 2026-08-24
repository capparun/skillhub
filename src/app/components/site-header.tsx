"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./site-header.module.css";

type SiteHeaderProps = {
  active?: "guide";
  onLogin?: () => void;
};

export function SiteHeader({ active, onLogin }: SiteHeaderProps) {
  const router = useRouter();

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
      return;
    }

    router.push("/?login=1");
  };

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="猎策 Hunter Works 首页">
        <Image className={styles.brandLogo} src="/hunter-dog.svg" alt="" width={48} height={48} />
        <span>
          <strong>猎策</strong>
          <small>HUNTER WORKS</small>
        </span>
      </Link>

      <nav className={styles.nav} aria-label="主导航">
        <Link href="/#skills">猎头工作流</Link>
        <Link className={active === "guide" ? styles.activeNav : undefined} href="/guide" aria-current={active === "guide" ? "page" : undefined}>
          新手入门
        </Link>
        <button className={styles.loginButton} type="button" onClick={handleLogin}>
          <span className={styles.loginLabelLong}>专业版登录</span>
          <span className={styles.loginLabelShort}>登录</span>
        </button>
      </nav>
    </header>
  );
}
