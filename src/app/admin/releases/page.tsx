"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import styles from "../admin.module.css";

interface ReleaseRow {
  id: string;
  productSlug: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  downloadsCount: number;
  releaseNotes: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}
interface ProductOption {
  slug: string;
  name: string;
}

export default function AdminReleasesPage() {
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [version, setVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api<{ releases: ReleaseRow[] }>("/api/admin/releases")
      .then((d) => setReleases(d.releases))
      .catch(() => setError("加载版本列表失败"));
    api<{ products: ProductOption[] }>("/api/products").then((d) => setProducts(d.products));
  }, []);

  useEffect(load, [load]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("productSlug", productSlug);
      form.set("version", version);
      form.set("releaseNotes", releaseNotes);
      form.set("file", file);
      const res = await fetch("/api/admin/releases", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "上传失败");
      }
      setNotice(`已上传 v${data.version}(SHA-256: ${data.sha256}),确认无误后点「发布」。`);
      setVersion("");
      setReleaseNotes("");
      setFile(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (id: string, action: "publish" | "unpublish") => {
    setError("");
    try {
      await api(`/api/admin/releases/${id}/${action}`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <>
      <h1>版本发布</h1>

      <div className={styles.card}>
        <h2>上传新版本</h2>
        <form className={styles.formRow} onSubmit={upload}>
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
            版本号
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="2.0.0"
              pattern="\d+\.\d+\.\d+"
              required
            />
          </label>
          <label>
            发布包(.tar.gz)
            <input
              type="file"
              accept=".tar.gz,application/gzip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label style={{ flex: 1, minWidth: 220 }}>
            更新说明(选填)
            <input value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} />
          </label>
          <button className={styles.btn} type="submit" disabled={submitting || !file}>
            {submitting ? "上传中…" : "上传"}
          </button>
        </form>
        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>商品</th>
            <th>版本</th>
            <th>状态</th>
            <th>大小</th>
            <th>下载次数</th>
            <th>SHA-256</th>
            <th>更新说明</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.id}>
              <td>{r.productSlug}</td>
              <td>v{r.version}</td>
              <td>
                <span className={r.isPublished ? styles.badgeOk : styles.badgeMuted}>
                  {r.isPublished ? "已发布" : "未发布"}
                </span>
              </td>
              <td className={styles.muted}>{(r.sizeBytes / 1024).toFixed(0)} KB</td>
              <td className={styles.muted}>{r.downloadsCount}</td>
              <td className={styles.mono} title={r.sha256}>
                {r.sha256.slice(0, 12)}…
              </td>
              <td className={styles.muted}>{r.releaseNotes || "—"}</td>
              <td>
                {r.isPublished ? (
                  <button
                    className={`${styles.btnSmall} ${styles.btnDanger}`}
                    onClick={() => {
                      if (window.confirm(`确定撤回 ${r.productSlug} v${r.version} 吗?`)) {
                        void act(r.id, "unpublish");
                      }
                    }}
                  >
                    撤回
                  </button>
                ) : (
                  <button
                    className={styles.btnSmall}
                    onClick={() => {
                      if (
                        window.confirm(
                          `发布后 ${r.productSlug} 的正式版本将切换为 v${r.version}(旧版本自动下架)。继续?`,
                        )
                      ) {
                        void act(r.id, "publish");
                      }
                    }}
                  >
                    发布
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
