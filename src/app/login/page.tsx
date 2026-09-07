"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "../components/site-header";
import { api, ApiError } from "@/lib/client/api";
import styles from "./login.module.css";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "网络异常,请稍后再试");
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>登录猎策</h1>
      <p className={styles.subtitle}>专业版安装需要登录并持有有效授权。</p>

      <label>
        <span>邮箱</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />
      </label>
      <label>
        <span>密码</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入密码"
          required
        />
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? "登录中…" : "登录"}
      </button>
      <small>账号由管理员开通;如需开通或忘记密码,请联系交付方。</small>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <SiteHeader />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
