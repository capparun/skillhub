import { cookies } from 'next/headers';
import { query } from './db';
import { env } from './env';
import { randomToken, sha256hex } from './tokens';
import { HttpError } from './http';

export const SESSION_COOKIE = 'lc_sess';
const SESSION_TTL_DAYS = 14;
// 剩余有效期不足一半时才续期,避免每个请求都写库
const RENEW_THRESHOLD_DAYS = 7;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'admin' | 'customer';
  status: 'active' | 'disabled';
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
  };
}

export async function createSession(userId: string): Promise<string> {
  const { plain, hash } = randomToken('lc');
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '14 days')`,
    [userId, hash],
  );
  return plain;
}

// 读取当前会话对应的用户;匿名返回 null。停用账号的会话视为无效。
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await query<{
    user_id: string;
    email: string;
    display_name: string | null;
    role: 'admin' | 'customer';
    status: 'active' | 'disabled';
    expires_at: Date;
  }>(
    `SELECT s.user_id, s.expires_at, u.email, u.display_name, u.role, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256hex(token)],
  );
  const row = result.rows[0];
  if (!row || row.status !== 'active') return null;

  if (row.expires_at.getTime() < Date.now() + RENEW_THRESHOLD_DAYS * 24 * 3600 * 1000) {
    await query(
      `UPDATE sessions SET expires_at = now() + interval '14 days', last_seen_at = now()
       WHERE token_hash = $1`,
      [sha256hex(token)],
    );
  } else {
    await query(`UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1`, [
      sha256hex(token),
    ]);
  }

  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256hex(token)]);
  }
  store.delete(SESSION_COOKIE);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'unauthorized', '请先登录');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new HttpError(403, 'forbidden', '需要管理员权限');
  return user;
}
