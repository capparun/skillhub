import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { HttpError } from './http';

// 发布包本地存储 + 签名下载 URL。
// 键布局: <productSlug>/<version>/<filename>.tar.gz,一律严格限制在存储目录内。

const KEY_PATTERN = /^[a-z0-9-]+\/\d+\.\d+\.\d+\/[a-z0-9.-]+\.tar\.gz$/;

export function buildPackageKey(slug: string, version: string, filename: string): string {
  const key = `${slug}/${version}/${filename}`;
  if (!KEY_PATTERN.test(key)) {
    throw new HttpError(400, 'validation_error', '无效的发布包文件名或版本号');
  }
  return key;
}

function resolveKeyPath(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new HttpError(404, 'not_found', '发布包不存在');
  const root = path.resolve(env.packageStorageDir());
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) {
    throw new HttpError(404, 'not_found', '发布包不存在');
  }
  return full;
}

// 从上传的临时文件落盘:计算 SHA-256,移动到正式位置,返回元数据。
export async function savePackage(
  tempFilePath: string,
  slug: string,
  version: string,
  filename: string,
): Promise<{ key: string; size: number; sha256: string }> {
  const key = buildPackageKey(slug, version, filename);
  const sha256 = await new Promise<string>((resolvePromise, rejectPromise) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(tempFilePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolvePromise(hash.digest('hex')))
      .on('error', rejectPromise);
  });
  const size = fs.statSync(tempFilePath).size;
  const target = resolveKeyPath(key);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // 持久卷挂载后与 /tmp 不在同一文件系统,rename 会 EXDEV,需复制后删除
  fs.copyFileSync(tempFilePath, target);
  fs.unlinkSync(tempFilePath);
  return { key, size, sha256 };
}

export function openPackage(key: string): { stream: fs.ReadStream; size: number } {
  const full = resolveKeyPath(key);
  if (!fs.existsSync(full)) throw new HttpError(404, 'not_found', '发布包不存在或已移除');
  return { stream: fs.createReadStream(full), size: fs.statSync(full).size };
}

// HMAC 签名下载地址: /api/download/<key>?e=<exp>&s=<sig>
export function signDownloadUrl(key: string, ttlSeconds?: number): string {
  const ttl = ttlSeconds ?? env.downloadUrlTtlSeconds();
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const sig = hmacFor(key, expires);
  return `${env.publicAppUrl()}/api/download/${key}?e=${expires}&s=${sig}`;
}

export function verifyDownloadUrl(key: string, expires: string | null, sig: string | null): void {
  if (!expires || !sig || !/^\d+$/.test(expires)) {
    throw new HttpError(403, 'url_invalid', '下载地址无效');
  }
  const exp = Number(expires);
  if (exp * 1000 < Date.now()) {
    throw new HttpError(403, 'url_expired', '下载地址已过期,请重新获取');
  }
  const expected = hmacFor(key, exp);
  const actual = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actual.length !== expectedBuf.length || !crypto.timingSafeEqual(actual, expectedBuf)) {
    throw new HttpError(403, 'url_invalid', '下载地址签名无效');
  }
}

function hmacFor(key: string, expires: number): string {
  return crypto
    .createHmac('sha256', env.packageUrlSecret())
    .update(`${key}.${expires}`)
    .digest('hex')
    .slice(0, 32);
}
