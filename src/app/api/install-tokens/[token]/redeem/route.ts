import { query, withTransaction } from '@/lib/server/db';
import { sha256hex, randomToken } from '@/lib/server/tokens';
import { signDownloadUrl } from '@/lib/server/packages';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, getClientIp, json } from '@/lib/server/http';
import { take } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

// 兑换一次性安装令牌:令牌本身就是凭据,无需登录。
// 事务内原子地把 issued → redeemed,并发重复兑换只有一笔能成功。
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const ip = getClientIp(request);
    if (!take(`redeem:${ip}`, 20, 300)) {
      throw new HttpError(429, 'rate_limited', '请求过于频繁,请稍后再试');
    }
    const tokenHash = sha256hex(token);

    const redeemed = await withTransaction(async (client) => {
      const updated = await client.query<{
        id: string;
        user_id: string;
        product_id: string;
      }>(
        `UPDATE install_tokens
         SET status = 'redeemed', redeemed_at = now()
         WHERE token_hash = $1 AND status = 'issued' AND expires_at > now()
         RETURNING id, user_id, product_id`,
        [tokenHash],
      );
      const installToken = updated.rows[0];
      if (!installToken) {
        throw new HttpError(410, 'token_expired_or_used', '安装令牌已过期或已被使用,请回到网站重新获取');
      }

      // 纵深防御:签发后被停用/撤销/到期,在兑换时同样拦截
      const userResult = await client.query<{ status: string }>(
        `SELECT status FROM users WHERE id = $1`,
        [installToken.user_id],
      );
      if (userResult.rows[0]?.status !== 'active') {
        throw new HttpError(403, 'account_disabled', '账号已被停用,请联系管理员');
      }
      const entitlementResult = await client.query<{
        status: string;
        expires_at: Date;
      }>(
        `SELECT status, expires_at FROM entitlements
         WHERE user_id = $1 AND product_id = $2`,
        [installToken.user_id, installToken.product_id],
      );
      const entitlement = entitlementResult.rows[0];
      if (!entitlement) throw new HttpError(403, 'not_entitled', '授权不存在');
      if (entitlement.status === 'revoked') {
        throw new HttpError(403, 'entitlement_revoked', '授权已被撤销,如有疑问请联系管理员');
      }
      if (entitlement.expires_at.getTime() <= Date.now()) {
        throw new HttpError(403, 'entitlement_expired', '授权已到期,续期后才能安装');
      }

      // 轮换更新凭据:旧凭据全部吊销,签发新凭据(每用户每商品仅一条有效)
      await client.query(
        `UPDATE update_credentials SET revoked_at = now()
         WHERE user_id = $1 AND product_id = $2 AND revoked_at IS NULL`,
        [installToken.user_id, installToken.product_id],
      );
      const credential = randomToken('hunter_uc');
      await client.query(
        `INSERT INTO update_credentials (user_id, product_id, credential_hash)
         VALUES ($1, $2, $3)`,
        [installToken.user_id, installToken.product_id, credential.hash],
      );
      await audit(installToken.user_id, 'install_token.redeemed', 'install_token', installToken.id, {}, client);

      return { ...installToken, credentialPlain: credential.plain };
    });

    const releaseResult = await query<{
      version: string;
      package_key: string;
      package_sha256: string;
      package_size_bytes: number;
      slug: string;
      name: string;
    }>(
      `SELECT r.version, r.package_key, r.package_sha256, r.package_size_bytes,
              p.slug, p.name
       FROM releases r JOIN products p ON p.id = r.product_id
       WHERE r.product_id = $1 AND r.is_published
       ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC
       LIMIT 1`,
      [redeemed.product_id],
    );
    const release = releaseResult.rows[0];
    if (!release) throw new HttpError(404, 'no_release', '该商品暂无已发布版本,请联系管理员');

    return json({
      product: { slug: release.slug, name: release.name },
      release: {
        version: release.version,
        sha256: release.package_sha256,
        sizeBytes: Number(release.package_size_bytes),
      },
      downloadUrl: signDownloadUrl(release.package_key),
      updateCredential: redeemed.credentialPlain,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
