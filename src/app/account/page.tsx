"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "../components/site-header";
import { api, ApiError, SessionInfo } from "@/lib/client/api";
import styles from "./account.module.css";

export default function AccountPage() {
  const router = useRouter();
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SessionInfo>("/api/auth/me")
      .then(setInfo)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login?next=/account");
        } else {
          setError("加载失败,请刷新重试");
        }
      });
  }, [router]);

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.panel}>
        <h1>我的账号</h1>
        {error && <p className={styles.error}>{error}</p>}
        {!info && !error && <p className={styles.loading}>加载中…</p>}
        {info && (
          <>
            <p className={styles.email}>{info.user.email}</p>
            <h2>我的授权</h2>
            {info.entitlements.length === 0 ? (
              <p className={styles.empty}>
                暂无专业版授权。免费的「职位需求对齐」无需授权,可直接到首页安装。
              </p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>状态</th>
                    <th>到期时间</th>
                  </tr>
                </thead>
                <tbody>
                  {info.entitlements.map((e) => (
                    <tr key={e.productSlug}>
                      <td>{e.productName}</td>
                      <td>
                        <span
                          className={
                            e.status === "active" && !e.expired
                              ? styles.badgeOk
                              : styles.badgeBad
                          }
                        >
                          {e.status === "revoked" ? "已撤销" : e.expired ? "已到期" : "有效"}
                        </span>
                      </td>
                      <td>{new Date(e.expiresAt).toLocaleDateString("zh-CN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={styles.hint}>
              授权到期后已安装的版本仍可继续使用,续期请联系交付方。安装入口在首页对应技能的弹窗中。
            </p>
          </>
        )}
      </section>
    </main>
  );
}
