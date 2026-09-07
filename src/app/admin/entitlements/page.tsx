"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import styles from "../admin.module.css";

interface EntitlementRow {
  id: string;
  userEmail: string;
  productSlug: string;
  status: "active" | "revoked";
  expiresAt: string;
  expired: boolean;
  note: string;
}
interface UserOption {
  id: string;
  email: string;
}
interface ProductOption {
  slug: string;
  name: string;
}

export default function AdminEntitlementsPage() {
  const [rows, setRows] = useState<EntitlementRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api<{ entitlements: EntitlementRow[] }>("/api/admin/entitlements")
      .then((d) => setRows(d.entitlements))
      .catch(() => setError("加载授权列表失败"));
    api<{ users: UserOption[] }>("/api/admin/users").then((d) => setUsers(d.users));
    api<{ products: ProductOption[] }>("/api/products").then((d) => setProducts(d.products));
  }, []);

  useEffect(load, [load]);

  const grant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api("/api/admin/entitlements", {
        method: "POST",
        body: { userId, productSlug, expiresAt: new Date(expiresAt).toISOString(), note },
      });
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const patch = async (id: string, body: unknown) => {
    setError("");
    try {
      await api(`/api/admin/entitlements/${id}`, { method: "PATCH", body });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <>
      <h1>授权管理</h1>

      <div className={styles.card}>
        <h2>开通 / 调整授权</h2>
        <form className={styles.formRow} onSubmit={grant}>
          <label>
            用户
            <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">选择用户</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            商品
            <select value={productSlug} onChange={(e) => setProductSlug(e.target.value)} required>
              <option value="">选择商品</option>
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            到期日期
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
            />
          </label>
          <label>
            备注(选填)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className={styles.btn} type="submit" disabled={submitting}>
            保存
          </button>
        </form>
        <p className={styles.muted} style={{ marginTop: 8 }}>
          同一用户同一商品重复保存会覆盖原授权(可用来延期或恢复已撤销的授权)。
        </p>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>用户</th>
            <th>商品</th>
            <th>状态</th>
            <th>到期时间</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.userEmail}</td>
              <td>{r.productSlug}</td>
              <td>
                <span
                  className={
                    r.status === "revoked"
                      ? styles.badgeBad
                      : r.expired
                        ? styles.badgeMuted
                        : styles.badgeOk
                  }
                >
                  {r.status === "revoked" ? "已撤销" : r.expired ? "已到期" : "有效"}
                </span>
              </td>
              <td>{new Date(r.expiresAt).toLocaleDateString("zh-CN")}</td>
              <td className={styles.muted}>{r.note || "—"}</td>
              <td>
                {r.status === "active" && (
                  <button
                    className={`${styles.btnSmall} ${styles.btnDanger}`}
                    onClick={() => {
                      if (window.confirm(`确定撤销 ${r.userEmail} 的 ${r.productSlug} 授权吗?`)) {
                        void patch(r.id, { status: "revoked" });
                      }
                    }}
                  >
                    撤销
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
