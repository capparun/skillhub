import { query } from './db';

// 授权校验谓词,签发令牌 / 兑换 / 更新授权三处共用。
// "到期"与"撤销"区分返回,客户端据此给出不同提示;到期后已安装版本仍可用。

export type EntitlementResult =
  | { ok: true; entitlement: { id: string; expiresAt: Date } }
  | { ok: false; code: 'not_entitled' | 'entitlement_expired' | 'entitlement_revoked' };

export async function checkEntitlement(
  userId: string,
  productId: string,
): Promise<EntitlementResult> {
  const result = await query<{
    id: string;
    status: 'active' | 'revoked';
    expires_at: Date;
  }>(
    `SELECT id, status, expires_at FROM entitlements
     WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  );
  const row = result.rows[0];
  if (!row) return { ok: false, code: 'not_entitled' };
  if (row.status === 'revoked') return { ok: false, code: 'entitlement_revoked' };
  if (row.expires_at.getTime() <= Date.now()) return { ok: false, code: 'entitlement_expired' };
  return { ok: true, entitlement: { id: row.id, expiresAt: row.expires_at } };
}
