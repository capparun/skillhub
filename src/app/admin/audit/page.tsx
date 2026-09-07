"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import styles from "../admin.module.css";

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "user.created": "创建用户",
  "user.disabled": "停用用户",
  "user.enabled": "启用用户",
  "user.password_reset": "重置密码",
  "entitlement.granted": "开通/调整授权",
  "entitlement.revoked": "撤销授权",
  "entitlement.updated": "调整授权",
  "install_token.issued": "签发安装令牌",
  "install_token.redeemed": "兑换安装令牌",
  "release.uploaded": "上传版本",
  "release.published": "发布版本",
  "release.unpublished": "撤回版本",
  "update_credential.revoked": "吊销更新凭据",
};

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((p: number) => {
    api<{ entries: AuditEntry[]; hasMore: boolean }>(`/api/admin/audit-log?page=${p}`)
      .then((d) => {
        setEntries(d.entries);
        setHasMore(d.hasMore);
        setPage(p);
      })
      .catch(() => setError("加载审计日志失败"));
  }, []);

  useEffect(() => load(1), [load]);

  return (
    <>
      <h1>审计日志</h1>
      {error && <p className={styles.error}>{error}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>时间</th>
            <th>操作人</th>
            <th>动作</th>
            <th>对象</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className={styles.muted} style={{ whiteSpace: "nowrap" }}>
                {new Date(e.createdAt).toLocaleString("zh-CN")}
              </td>
              <td>{e.actorEmail}</td>
              <td>{ACTION_LABELS[e.action] ?? e.action}</td>
              <td className={styles.muted}>
                {e.targetType} <span className={styles.mono}>{e.targetId.slice(0, 8)}…</span>
              </td>
              <td className={styles.muted}>
                {Object.keys(e.metadata).length > 0 ? JSON.stringify(e.metadata) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.pager}>
        <button
          className={styles.btnSmall}
          disabled={page <= 1}
          onClick={() => load(page - 1)}
        >
          上一页
        </button>
        <span className={styles.muted}>第 {page} 页</span>
        <button className={styles.btnSmall} disabled={!hasMore} onClick={() => load(page + 1)}>
          下一页
        </button>
      </div>
    </>
  );
}
