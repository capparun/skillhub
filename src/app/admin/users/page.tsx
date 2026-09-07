"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import styles from "../admin.module.css";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "customer";
  status: "active" | "disabled";
  createdAt: string;
  entitlements: { productSlug: string; status: string; expiresAt: string }[];
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ title: string; password: string } | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api<{ users: UserRow[] }>("/api/admin/users")
      .then((d) => setUsers(d.users))
      .catch(() => setError("加载用户列表失败"));
  }, []);

  useEffect(load, [load]);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await api<{ user: UserRow; initialPassword: string }>("/api/admin/users", {
        method: "POST",
        body: { email, displayName },
      });
      setNotice({ title: `已创建 ${result.user.email},初始密码(只显示这一次):`, password: result.initialPassword });
      setEmail("");
      setDisplayName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const patch = async (id: string, body: unknown) => {
    setError("");
    setNotice(null);
    try {
      const result = await api<{ newPassword?: string }>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body,
      });
      if (result.newPassword) {
        setNotice({ title: "新密码(只显示这一次):", password: result.newPassword });
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <>
      <h1>用户管理</h1>

      <div className={styles.card}>
        <h2>创建用户</h2>
        <form className={styles.formRow} onSubmit={createUser}>
          <label>
            邮箱
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            姓名(选填)
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <button className={styles.btn} type="submit" disabled={submitting}>
            创建
          </button>
        </form>
        {notice && (
          <p className={styles.notice}>
            {notice.title} <code>{notice.password}</code>
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>邮箱</th>
            <th>姓名</th>
            <th>角色</th>
            <th>状态</th>
            <th>授权</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.displayName ?? "—"}</td>
              <td>{u.role === "admin" ? "管理员" : "客户"}</td>
              <td>
                <span className={u.status === "active" ? styles.badgeOk : styles.badgeBad}>
                  {u.status === "active" ? "正常" : "已停用"}
                </span>
              </td>
              <td className={styles.muted}>
                {u.entitlements.length === 0
                  ? "—"
                  : u.entitlements
                      .map((e) => `${e.productSlug}(${e.status === "active" ? "有效" : "已撤销"})`)
                      .join("、")}
              </td>
              <td className={styles.muted}>{new Date(u.createdAt).toLocaleDateString("zh-CN")}</td>
              <td>
                <button
                  className={styles.btnSmall}
                  onClick={() => {
                    if (window.confirm(`确定要重置 ${u.email} 的密码吗?旧密码立即失效。`)) {
                      void patch(u.id, { resetPassword: true });
                    }
                  }}
                >
                  重置密码
                </button>{" "}
                <button
                  className={`${styles.btnSmall} ${u.status === "active" ? styles.btnDanger : ""}`}
                  onClick={() => {
                    const target = u.status === "active" ? "disabled" : "active";
                    if (window.confirm(`确定要${target === "disabled" ? "停用" : "启用"} ${u.email} 吗?`)) {
                      void patch(u.id, { status: target });
                    }
                  }}
                >
                  {u.status === "active" ? "停用" : "启用"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
