import { env } from '@/lib/server/env';

export const runtime = 'nodejs';

// 安装引导脚本:命令行用户 curl | bash 即可完成兑换/下载/校验/安装/诊断。
// 用法: curl -fsSL <server>/install.sh | bash -s -- <商品标识> [安装令牌]
// 免费商品不带令牌(走公开下载地址);付费商品必须带一次性安装令牌。
function renderScript(appUrl: string): string {
  return `#!/usr/bin/env bash
# 猎策 Hunter 安装引导脚本(由服务器生成,请勿修改)
set -euo pipefail

SERVER="${appUrl}"
PRODUCT="\${1:-}"
TOKEN="\${2:-}"

if [ -z "\$PRODUCT" ]; then
  echo "用法: curl -fsSL \$SERVER/install.sh | bash -s -- <商品标识> [安装令牌]" >&2
  exit 1
fi

if [ "\$PRODUCT" = "maimai-only" ] && [ "\$(uname -s)" != "Darwin" ] && [ "\$(uname -s)" != "Linux" ]; then
  echo "脉脉实际寻访仅支持 macOS / Linux" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js,请先安装 Node.js 20 或更高版本: https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="\$(node -p "process.versions.node.split('.')[0]")"
MIN_NODE=20
if [ "\$PRODUCT" = "gllue-only" ] || [ "\$PRODUCT" = "liepin-search" ] || [ "\$PRODUCT" = "soho-sourcing" ]; then MIN_NODE=22; fi
if [ "\$NODE_MAJOR" -lt "\$MIN_NODE" ]; then
  echo "Node.js 版本过低(\$(node --version)),请升级到 \$MIN_NODE 或更高版本" >&2
  exit 1
fi

if [ "\$PRODUCT" = "maimai-only" ]; then
  node -e 'const v=process.versions.node.split(".").map(Number); if(v[0]<20 || (v[0]===20 && (v[1]<18 || (v[1]===18 && v[2]<1)))) { console.error("脉脉包需要 Node.js 20.18.1+");process.exit(1); }'
fi
WORKDIR="\$(mktemp -d)"
cd "\$WORKDIR"
echo "→ 工作目录: \$WORKDIR"

if [ -n "\$TOKEN" ]; then
  echo "→ 兑换安装令牌 ..."
  curl -fsSL -X POST "\$SERVER/api/install-tokens/\$TOKEN/redeem" -o redeem.json || {
    echo "令牌兑换失败(可能已过期或已使用),请回到网站重新获取" >&2
    exit 1
  }
else
  echo "→ 获取最新版本信息 ..."
  curl -fsSL "\$SERVER/api/releases/latest?product=\$PRODUCT" -o redeem.json || {
    echo "获取版本信息失败,请检查网络或稍后再试" >&2
    exit 1
  }
fi

node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./redeem.json', 'utf8'));
if (d.error) {
  console.error('服务器返回错误: ' + (d.error.message || d.error.code));
  process.exit(1);
}
const rel = d.release || d;
const out = {
  DL: d.downloadUrl,
  SHA: rel.sha256,
  VER: rel.version,
  CRED: d.updateCredential || '',
};
for (const key of ['DL', 'SHA', 'VER']) {
  if (!out[key]) { console.error('服务器响应缺少字段: ' + key); process.exit(1); }
}
for (const key of Object.keys(out)) {
  fs.writeFileSync('./pkg.' + key, String(out[key]), {flag:'wx', mode:0o600});
}
" || exit 1
DL="\$(cat ./pkg.DL)"
SHA="\$(cat ./pkg.SHA)"
VER="\$(cat ./pkg.VER)"
CRED="\$(cat ./pkg.CRED)"

echo "→ 下载安装包 v\$VER ..."
curl -fsSL -o pkg.tar.gz "\$DL"

echo "→ 校验 SHA-256 ..."
ACTUAL="\$(shasum -a 256 pkg.tar.gz | cut -d' ' -f1)"
if [ "\$ACTUAL" != "\$SHA" ]; then
  echo "安装包校验失败(与发布哈希不一致),已中止。请重新下载或联系交付方。" >&2
  exit 1
fi

tar -xzf pkg.tar.gz
PKGDIR="\$(node -e '
const fs = require("fs");
const roots = fs.existsSync("install.mjs") ? ["."] : fs.readdirSync(".", {withFileTypes:true}).filter(e => e.isDirectory() && fs.existsSync(e.name + "/install.mjs")).map(e => e.name);
if (roots.length !== 1 || !fs.existsSync(roots[0] + "/doctor.mjs")) { console.error("安装包内容不正确：需要唯一的安装和诊断脚本目录"); process.exit(1); }
console.log(roots[0]);
')"
cd "\$PKGDIR"

echo "→ 安装技能与插件 ..."
if [ -n "\$CRED" ]; then
  node install.mjs --product "\$PRODUCT" --version "\$VER" --server "\$SERVER" --update-credential "\$CRED"
else
  node install.mjs --product "\$PRODUCT" --version "\$VER" --server "\$SERVER"
fi

echo "→ 环境诊断 ..."
node doctor.mjs
echo ""
echo "✓ 本地安装与检查完成，请返回安装页继续连接网站与使用验证。"
`;
}

export async function GET() {
  return new Response(renderScript(env.publicAppUrl()), {
    headers: {
      'content-type': 'text/x-shellscript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
