import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../src/app/install.ps1/route';

test('install.ps1 starts with UTF-8 BOM for Windows PowerShell 5.1', async () => {
  const response = await GET();
  const bytes = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
});

test('Windows package requests use verified Node HTTPS without retrying redemption', async () => {
  const script = await (await GET()).text();
  assert.ok(script.includes('Save-HunterResponse'));
  assert.ok(script.includes("'redeem.json' 'POST'"));
  assert.ok(script.includes("Save-HunterResponse $downloadUrl 'pkg.tar.gz'"));
  assert.ok(script.includes('Get-Content redeem.json -Raw -Encoding UTF8'));
  assert.ok(!script.includes('Invoke-WebRequest'));
  assert.ok(!script.includes('Invoke-RestMethod'));
  assert.ok(!script.includes('NODE_TLS_REJECT_UNAUTHORIZED'));
  assert.ok(!script.includes('ServerCertificateValidationCallback'));
});

test('Windows native extraction output is logged before checking its exit status', async () => {
  const script = await (await GET()).text();
  assert.ok(script.includes("tar.exe -xzf pkg.tar.gz *> (Join-Path $logDir 'extract.txt')"));
  assert.ok(script.includes('$extractExit = $LASTEXITCODE'));
  assert.ok(script.includes('& node -e $code $Uri $OutFile $Method *> $requestLog'));
});
