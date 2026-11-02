import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {liepinExtensionFor,liepinBrowserAssets} from '../src/lib/liepin-browser-assets';
import {liepinMcpGuide} from '../src/lib/liepin-guide';

test('extension download has exact archive hash, immutable URL and compatible release guard',()=>{
 const asset=liepinExtensionFor('0.3.4');assert.ok(asset);
 const bytes=fs.readFileSync(new URL('../public'+asset.downloadPath,import.meta.url));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.length,asset.sizeBytes);
 assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);
 assert.equal(asset.expectedExtensionId,'ebhhcfiikojppnmkimkhcajpieelbglb');assert.equal(asset.files,12);
 assert.equal(liepinExtensionFor('9.9.9'),null);
});
for(const platform of ['windows','mac'] as const)test(`${platform} prompt gives download and complete browser setup without visiting Liepin`,()=>{
 const guide=liepinMcpGuide({version:'0.3.4',sha256:'a'.repeat(64),command:'official-install',platform,appUrl:'https://skills.example.com',keyword:'',city:''});
 assert.ok(guide.connect.includes('https://skills.example.com'+liepinBrowserAssets.downloadPath));
 for(const fragment of ['chrome://extensions','加载已解压','expectedExtensionId','browser-setup plan','doctor','不打开猎聘','不能替代完整组件'])assert.ok(guide.connect.includes(fragment),fragment);
 assert.ok(guide.install.includes('安装后必须继续展示'));assert.ok(!guide.connect.includes('我会登录猎聘'));
});
