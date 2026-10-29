export function validateExpectedRelease(id, sha256) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')
    || !/^[0-9a-f]{64}$/.test(sha256 ?? '')) {
    throw new Error('Provide --expected-current-release-id and --expected-current-sha256');
  }
}

// Caller owns the transaction. Lock the product and active rows before changing
// any release, so a stale approval cannot replace a newly published version.
export async function lockExpectedGllueRelease(client, id, sha256) {
  validateExpectedRelease(id, sha256);
  // The existing admin endpoint does not take the product lock. Serialize
  // release writes with it as well; ordinary reads remain available.
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('LOCK TABLE releases IN SHARE ROW EXCLUSIVE MODE');
  const { rows: products } = await client.query(
    'SELECT id, is_public FROM products WHERE slug = $1 FOR UPDATE', ['gllue-only']);
  if (products.length !== 1 || !products[0].is_public) throw new Error('Expected existing public gllue-only product');
  const productId = products[0].id;
  const { rows } = await client.query(
    'SELECT id, package_sha256 FROM releases WHERE product_id = $1 AND is_published FOR UPDATE', [productId]);
  if (rows.length !== 1 || rows[0].id !== id || rows[0].package_sha256 !== sha256) {
    throw new Error('Current release changed; publication approval is stale');
  }
  return productId;
}
