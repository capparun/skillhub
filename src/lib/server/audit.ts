import pg from 'pg';
import { query } from './db';

// 管理员审计。metadata 里绝不写入明文令牌、密码等敏感内容。
export async function audit(
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
  client?: pg.PoolClient,
): Promise<void> {
  const sql = `INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
               VALUES ($1, $2, $3, $4, $5)`;
  const params = [actorUserId, action, targetType, targetId, JSON.stringify(metadata)];
  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}
