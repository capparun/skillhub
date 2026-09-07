import crypto from 'node:crypto';
import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { hashPassword } from '@/lib/server/passwords';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 停用/启用账号,或重置密码。停用会立刻删除该用户全部会话。
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);

    const existing = await query<{ email: string; status: string }>(
      `SELECT email, status FROM users WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw new HttpError(404, 'not_found', '用户不存在');

    if (body?.resetPassword === true) {
      const newPassword = crypto.randomBytes(9).toString('base64url');
      await query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
        hashPassword(newPassword),
        id,
      ]);
      await query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      await audit(admin.id, 'user.password_reset', 'user', id, { email: existing.rows[0].email });
      return json({ newPassword });
    }

    const status = body?.status;
    if (status !== 'active' && status !== 'disabled') {
      throw new HttpError(400, 'validation_error', 'status 只能是 active 或 disabled');
    }
    if (status === 'disabled' && id === admin.id) {
      throw new HttpError(400, 'validation_error', '不能停用自己的账号');
    }

    await query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
    if (status === 'disabled') {
      await query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    }
    await audit(admin.id, status === 'disabled' ? 'user.disabled' : 'user.enabled', 'user', id, {
      email: existing.rows[0].email,
    });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
