import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../src/app/install.ps1/route';

test('install.ps1 starts with UTF-8 BOM for Windows PowerShell 5.1', async () => {
  const response = await GET();
  const bytes = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
});
