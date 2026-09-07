import crypto from 'node:crypto';

// 生成带前缀的随机令牌(32 字节,base64url),返回明文与 SHA-256 哈希。
// 数据库只存哈希,明文只在签发时展示一次。
export function randomToken(prefix: string): { plain: string; hash: string } {
  const plain = `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
  return { plain, hash: sha256hex(plain) };
}

export function sha256hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
