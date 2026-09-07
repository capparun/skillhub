"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import styles from "./admin.module.css";

interface UserRow {
  id: string;
  status: string;
}
interface EntitlementRow {
  status: string;
  expired: boolean;
}
interface ReleaseRow {
  isPublished: boolean;
  productSlug: string;
  version: string;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<{
    users: number;
    activeEntitlements: number;
    published: string[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ users: UserRow[] }>("/api/admin/users"),
      api<{ entitlements: EntitlementRow[] }>("/api/admin/entitlements"),
      api<{ releases: ReleaseRow[] }>("/api/admin/releases"),
    ])
      .then(([users, entitlements, releases]) => {
        setStats({
          users: users.users.length,
          activeEntitlements: entitlements.entitlements.filter(
            (e) => e.status === "active" && !e.expired,
          ).length,
          published: releases.releases
            .filter((r) => r.isPublished)
            .map((r) => `${r.productSlug} v${r.version}`),
        });
      })
      .catch(() => setError("加载失败,请刷新重试"));
  }, []);

  return (
    <>
      <h1>概览</h1>
      {error && <p className={styles.error}>{error}</p>}
      {!stats && !error && <p className={styles.muted}>加载中…</p>}
      {stats && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <small>注册用户</small>
            <strong>{stats.users}</strong>
          </div>
          <div className={styles.stat}>
            <small>有效授权</small>
            <strong>{stats.activeEntitlements}</strong>
          </div>
          <div className={styles.stat}>
            <small>当前正式发布</small>
            <strong style={{ fontSize: 16 }}>
              {stats.published.length > 0 ? stats.published.join("、") : "暂无"}
            </strong>
          </div>
        </div>
      )}
    </>
  );
}
