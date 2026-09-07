import { cookies } from 'next/headers';
import { query } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/passwords';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session';
import { HttpError, errorResponse, getClientIp, json } from '@/lib/server/http';
import { take } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) {
      throw new HttpError(400, 'validation_error', '请输入邮箱和密码');
    }

    const ip = getClientIp(request);
    if (!take(`login:${ip}:${email}`, 10, 300)) {
      throw new HttpError(429, 'rate_limited', '尝试次数过多,请 5 分钟后再试');
    }

    const result = await query<{
      id: string;
      email: string;
      display_name: string | null;
      role: 'admin' | 'customer';
      status: 'active' | 'disabled';
      password_hash: string;
    }>(`SELECT id, email, display_name, role, status, password_hash FROM users WHERE email = $1`, [
      email,
    ]);
    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'invalid_credentials', '邮箱或密码不正确');
    }
    if (row.status !== 'active') {
      throw new HttpError(403, 'account_disabled', '账号已被停用,请联系管理员');
    }

    const token = await createSession(row.id);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());

    return json({
      user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
