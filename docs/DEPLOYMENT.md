# 猎策分发站部署指南(Zeabur)

## 服务构成

| 服务 | 说明 |
|------|------|
| PostgreSQL | Zeabur 一键创建的 Postgres 服务 |
| Next.js 站点 | 本仓库,展示 + 登录 + 授权 + 安装 API + 管理后台 |

## 首次部署步骤

1. **创建 Postgres 服务**:Zeabur 项目中添加 PostgreSQL,记下连接串。
2. **创建 Next 服务**:从本仓库部署。根目录 `zbpack.json` 已指定 `deploy/site.Dockerfile`(Java 后端镜像构建请用 `server/Dockerfile`,勿在根目录再放 Dockerfile——Zeabur 检测到根 Dockerfile 会绕过 zbpack 直接构建,环境变量 `ZBPACK_DOCKERFILE_PATH` 不生效),只需在服务设置中:
   - 添加持久卷,挂载路径:`/data/packages`
3. **配置环境变量**(参考 `.env.example`):
   - `DATABASE_URL`:Postgres 服务连接串
   - `SESSION_SECRET`:随机长字符串(`openssl rand -base64 32`)
   - `PACKAGE_STORAGE_DIR`:`/data/packages`
   - `PUBLIC_APP_URL`:站点的最终访问地址(https://…,决定 Cookie Secure 开关)
   - `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`:首位管理员(仅首次 seed 用)
4. **初始化数据库**(本地或任何能连上该 Postgres 的机器):

   ```bash
   DATABASE_URL=<连接串> node scripts/migrate.mjs
   DATABASE_URL=<连接串> ADMIN_EMAIL=<管理员邮箱> ADMIN_INITIAL_PASSWORD=<初始密码> node scripts/seed.mjs
   ```

5. **发布首发版本**:登录 `/admin` → 版本发布 → 上传 csk 构建的 tar.gz 包 → 发布。
   - 免费商品 `hunter-align` ← csk `dist/hunter-align-vX.Y.Z.tar.gz`
   - 付费商品 `soho-sourcing` ← csk `dist/hunter-linkedin-only-vX.Y.Z.tar.gz`

## 日常运维

- 发布新版:管理后台上传 + 点发布(自动下架旧版);撤回按钮用于回滚。
- 数据库迁移:仓库新增 `db/migrations/00XX_*.sql` 后,重跑 `node scripts/migrate.mjs`。
- 日志不记录明文令牌/密码;审计日志在 `/admin/audit`。
