# 猎策分发站部署指南(Zeabur)

## 服务构成

| 服务 | 说明 |
|------|------|
| PostgreSQL | Zeabur 一键创建的 Postgres 服务 |
| Next.js 站点 | 本仓库,展示 + 登录 + 授权 + 安装 API + 管理后台 |

## 首次部署步骤

1. **创建 Postgres 服务**:Zeabur 项目中添加 PostgreSQL,记下连接串。
2. **创建 Next 服务**:**不要从 GitHub 仓库创建**——Zeabur 服务的构建计划在创建时生成并永久缓存,本仓库含 `server/Dockerfile`(Java 后端),会被误选且之后任何仓库侧改动(zbpack.json、根 Dockerfile、`ZBPACK_*` 环境变量)都无法纠正。正确做法:本地运行 `scripts/deploy-zeabur.sh` 用 `zeabur deploy` 上传纯 Next.js 源码创建服务(脚本会组装不含 server/web/cli 的干净目录)。服务创建后:
   - 添加持久卷,挂载路径:`/data/packages`
3. **配置环境变量**(参考 `.env.example`):
   - `DATABASE_URL`:`${POSTGRES_CONNECTION_STRING}`(引用 PG 服务注入的变量)
   - `SESSION_SECRET`:随机长字符串(`openssl rand -base64 32`)
   - `PACKAGE_STORAGE_DIR`:`/data/packages`
   - `PUBLIC_APP_URL`:站点的最终访问地址(https://…,决定 Cookie Secure 开关)
   - `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`:首位管理员(仅首次 seed 用,seed 后可删)
4. **初始化数据库**(本地或任何能连上该 Postgres 的机器):

   ```bash
   DATABASE_URL=<连接串> node scripts/migrate.mjs
   DATABASE_URL=<连接串> ADMIN_EMAIL=<管理员邮箱> ADMIN_INITIAL_PASSWORD=<初始密码> node scripts/seed.mjs
   ```

5. **发布首发版本**:登录 `/admin` → 版本发布 → 上传 csk 构建的 tar.gz 包 → 发布。
   - 免费商品 `hunter-align` ← csk `dist/hunter-align-vX.Y.Z.tar.gz`
   - 付费商品 `soho-sourcing` ← csk `dist/hunter-linkedin-only-vX.Y.Z.tar.gz`

## 日常部署(改代码后上线)

```bash
scripts/deploy-zeabur.sh   # 本地打包上传,自动触发构建
```

注意:`zeabur service redeploy` 对本服务无效(未绑定 Git 仓库),重部署也用上面的脚本。
上传的临时文件落盘在 `/tmp`,与持久卷跨文件系统——代码里已用 copy+unlink 处理(勿改回 rename)。

## 当前生产环境(2026-09)

| 项 | 值 |
|---|---|
| 项目 | hunterSkillHub |
| 服务 | `hunterskill`(旧的 `skillhub` 服务构建计划焊死为 Java,已弃用) |
| 域名 | https://hunterskill.zeabur.app |
| 持久卷 | `/data/packages` |
| 数据库 | Zeabur PostgreSQL,公网入口见 PG 服务「网络」页 |

## 日常运维

- 发布新版:管理后台上传 + 点发布(自动下架旧版);撤回按钮用于回滚。
- 数据库迁移:仓库新增 `db/migrations/00XX_*.sql` 后,重跑 `node scripts/migrate.mjs`。
- 日志不记录明文令牌/密码;审计日志在 `/admin/audit`。
