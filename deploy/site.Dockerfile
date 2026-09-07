# 猎策分发站 - Next.js 全栈服务镜像
# Zeabur 部署:服务设置中将 Dockerfile 路径指定为 deploy/site.Dockerfile,构建上下文为仓库根目录。
# (根目录的 Dockerfile 是 Java 后端用的,两个服务互不影响)

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
EXPOSE 3000
CMD ["node", "server.js"]
