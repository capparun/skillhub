# 猎策分发站 - Next.js 全栈服务镜像
# 本文件必须位于仓库根目录:Zeabur 会优先使用根 Dockerfile 构建,
# 子目录 Dockerfile 指定(zbpack.json / ZBPACK_DOCKERFILE_PATH)在多 Dockerfile
# 仓库中并不可靠(实测会误选 server/Dockerfile)。
# Java 后端镜像构建请使用 server/Dockerfile(CI 亦如此),与本文件互不影响。

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY scripts/publish-gllue-release.mjs ./scripts/publish-gllue-release.mjs
COPY scripts/publish-liepin-release.mjs scripts/rollback-liepin-release.mjs ./scripts/
COPY scripts/lib/liepin-release-guard.mjs ./scripts/lib/liepin-release-guard.mjs
COPY scripts/publish-linkedin-release.mjs ./scripts/publish-linkedin-release.mjs
COPY scripts/lib/linkedin-release-guard.mjs ./scripts/lib/linkedin-release-guard.mjs
EXPOSE 3000
CMD ["node", "server.js"]
