import { query } from '@/lib/server/db';
import { sha256hex } from '@/lib/server/tokens';
import { signDownloadUrl } from '@/lib/server/packages';
import { checkEntitlement } from '@/lib/server/entitlements';
import { HttpError, errorResponse, getClientIp, json } from '@/lib/server/http';
import { take } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

// 付费更新授权:客户端持可撤销更新凭据换取限时下载地址。
// 授权到期/撤销返回不同错误码,客户端分别提示;已安装版本不受影响。
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!take(`update-auth:${ip}`, 30, 300)) {
      throw new HttpError(429, 'rate_limited', '请求过于频繁,请稍后再试');
    }

    const body = await request.json().catch(() => null);
    const productSlug = typeof body?.productSlug === 'string' ? body.productSlug : '';
    const credential = typeof body?.credential === 'string' ? body.credential : '';
    if (!productSlug || !credential) {
      throw new HttpError(400, 'validation_error', '缺少 productSlug 或 credential');
    }

    const credResult = await query<{
      id: string;
      user_id: string;
      product_id: string;
      user_status: string;
    }>(
      `SELECT uc.id, uc.user_id, uc.product_id, u.status AS user_status
       FROM update_credentials uc
       JOIN products p ON p.id = uc.product_id
       JOIN users u ON u.id = uc.user_id
       WHERE uc.credential_hash = $1 AND uc.revoked_at IS NULL AND p.slug = $2`,
      [sha256hex(credential), productSlug],
    );
    const cred = credResult.rows[0];
    if (!cred) {
      throw new HttpError(403, 'credential_invalid', '更新凭据无效或已被撤销,请重新安装');
    }
    if (cred.user_status !== 'active') {
      throw new HttpError(403, 'account_disabled', '账号已被停用,请联系管理员');
    }

    const entitlement = await checkEntitlement(cred.user_id, cred.product_id);
    if (!entitlement.ok) {
      const messages = {
        not_entitled: '授权不存在,请联系管理员',
        entitlement_expired: '授权已到期,已安装版本可继续使用;续期后才能获取更新',
        entitlement_revoked: '授权已被撤销,已安装版本可继续使用;如有疑问请联系管理员',
      } as const;
      throw new HttpError(403, entitlement.code, messages[entitlement.code]);
    }

    const releaseResult = await query<{
      version: string;
      package_key: string;
      package_sha256: string;
      package_size_bytes: number;
    }>(
      `SELECT version, package_key, package_sha256, package_size_bytes
       FROM releases
       WHERE product_id = $1 AND is_published
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [cred.product_id],
    );
    const release = releaseResult.rows[0];
    if (!release) throw new HttpError(404, 'no_release', '该商品暂无已发布版本');

    await query(`UPDATE update_credentials SET last_used_at = now() WHERE id = $1`, [cred.id]);

    return json({
      release: {
        version: release.version,
        sha256: release.package_sha256,
        sizeBytes: Number(release.package_size_bytes),
      },
      downloadUrl: signDownloadUrl(release.package_key),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
