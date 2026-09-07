#!/usr/bin/env bash
# 部署分发站到 Zeabur(hunterskill 服务,本地打包上传,不走 GitHub 触发)。
#
# 背景:本仓库是多模块仓库(server/ Java 后端、web/ 旧 SPA 等),Zeabur 服务的
# 构建计划在创建时生成并缓存,会误选 server/Dockerfile。因此部署时只上传
# Next.js 应用所需文件组成的干净目录,构建方案识别为 Node/Next.js,稳定可靠。
#
# 用法:scripts/deploy-zeabur.sh
# 前置:zeabur CLI 已登录(zeabur auth login)
set -euo pipefail

SERVICE_ID="6a9ecb4ae31b231aae397908"
ENV_ID="6a9e8b11c6601a0af790e9d1"
STAGING=$(mktemp -d /tmp/hunterskill-deploy.XXXXXX)
trap 'rm -rf "$STAGING"' EXIT

cd "$(dirname "$0")/.."
echo "→ 组装干净部署目录: $STAGING"
rsync -a src public scripts db \
  package.json package-lock.json next.config.ts tsconfig.json next-env.d.ts \
  "$STAGING/"
cp skillhub.Dockerfile "$STAGING/Dockerfile"

echo "→ 上传到 Zeabur 并触发构建"
cd "$STAGING"
zeabur deploy --service-id "$SERVICE_ID" --environment-id "$ENV_ID" -i=false

echo "→ 完成。线上验证: curl -s https://hunterskill.zeabur.app/api/products"
