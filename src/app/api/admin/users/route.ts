import crypto from 'node:crypto';
import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { hashPassword } from '@/lib/server/passwords';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 用户列表(含授权摘要)
export async function GET() {
  try {
    await requireAdmin();
    const result = await query<{
      id: string;
      email: string;
      display_name: string | null;
      role: 'admin' | 'customer';
      status: 'active' | 'disabled';
      created_at: Date;
      entitlements: unknown;
    }>(
      `SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'productSlug', p.slug, 'status', e.status, 'expiresAt', e.expires_at))
                FROM entitlements e JOIN products p ON p.id = e.product_id
                WHERE e.user_id = u.id
              ), '[]'::json) AS entitlements
       FROM users u
       ORDER BY u.created_at DESC`,
    );
    return json({
      users: result.rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        role: r.role,
        status: r.status,
        createdAt: r.created_at,
        entitlements: r.entitlements,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// 创建用户;初始密码只在本响应中显示一次
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const role = body?.role === 'admin' ? 'admin' : 'customer';
    const initialPassword =
      typeof body?.initialPassword === 'string' && body.initialPassword.length >= 8
        ? body.initialPassword
        : crypto.randomBytes(9).toString('base64url');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'validation_error', '请输入有效的邮箱地址');
    }

    const existing = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (existing.rows.length > 0) {
      throw new HttpError(409, 'email_taken', '该邮箱已被使用');
    }

    const result = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, hashPassword(initialPassword), displayName || null, role],
    );
    const id = result.rows[0].id;
    await audit(admin.id, 'user.created', 'user', id, { email, role });

    return json({ user: { id, email, displayName, role }, initialPassword }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
