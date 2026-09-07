"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, SessionInfo } from "@/lib/client/api";
import styles from "./admin.module.css";

const NAV = [
  { href: "/admin", label: "概览" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/entitlements", label: "授权" },
  { href: "/admin/releases", label: "版本发布" },
  { href: "/admin/audit", label: "审计日志" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api<SessionInfo>("/api/auth/me")
      .then((data) => {
        if (data.user.role !== "admin") {
          setDenied(true);
        } else {
          setInfo(data);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
        } else {
          setDenied(true);
        }
      });
  }, [router, pathname]);

  if (denied) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>需要管理员权限。</p>
      </main>
    );
  }
  if (!info) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>加载中…</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Link href="/" className={styles.brand}>
            猎策 · 管理后台
          </Link>
          <nav>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? styles.activeNav : ""}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className={styles.adminEmail}>{info.user.email}</span>
        </aside>
        <section className={styles.content}>{children}</section>
      </div>
    </main>
  );
}
