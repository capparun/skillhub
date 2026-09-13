import { query } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { requireUser } from '@/lib/server/session';
import { checkEntitlement } from '@/lib/server/entitlements';
import { randomToken } from '@/lib/server/tokens';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';
import { paidInstallPrompt, paidCliCommand, windowsPaidCliCommand } from '@/lib/prompts';

export const runtime = 'nodejs';

// 为已登录且有有效授权的用户签发一次性安装令牌(默认 10 分钟有效)。
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const productSlug = typeof body?.productSlug === 'string' ? body.productSlug : '';
    if (!productSlug) throw new HttpError(400, 'validation_error', '缺少 productSlug');

    const productResult = await query<{ id: string; name: string }>(
      `SELECT id, name FROM products WHERE slug = $1`,
      [productSlug],
    );
    const product = productResult.rows[0];
    if (!product) throw new HttpError(404, 'not_found', '商品不存在');

    const entitlement = await checkEntitlement(user.id, product.id);
    if (!entitlement.ok) {
      const messages = {
        not_entitled: '您的账号尚未开通该商品授权,请联系管理员',
        entitlement_expired: '您的授权已到期,续期后才能安装新版本',
        entitlement_revoked: '您的授权已被撤销,如有疑问请联系管理员',
      } as const;
      throw new HttpError(403, entitlement.code, messages[entitlement.code]);
    }

    const ttlMinutes = env.installTokenTtlMinutes();
    const { plain, hash } = randomToken('hunter_it');
    await query(
      `INSERT INTO install_tokens (user_id, product_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
      [user.id, product.id, hash, String(ttlMinutes)],
    );
    await audit(user.id, 'install_token.issued', 'product', product.id, { productSlug });

    const releaseResult = await query<{ version: string }>(
      `SELECT version FROM releases
       WHERE product_id = $1 AND is_published
       ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [product.id],
    );
    const version = releaseResult.rows[0]?.version ?? null;

    const appUrl = env.publicAppUrl();
    return json({
      token: plain,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      redeemUrl: `${appUrl}/api/install-tokens/${plain}/redeem`,
      product: { slug: productSlug, name: product.name, version },
      installPrompt: paidInstallPrompt({
        appUrl,
        productName: product.name,
        productSlug,
        token: plain,
        tokenTtlMinutes: ttlMinutes,
      }),
      cliCommand: paidCliCommand({ appUrl, productSlug, token: plain }),
      windowsCliCommand: windowsPaidCliCommand({ appUrl, productSlug, token: plain }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
