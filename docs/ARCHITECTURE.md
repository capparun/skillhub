# Hunter SkillHub 技术架构（MVP）

> **实施状态（2026-09-07）**：已按本文档落地，实际代码位于仓库根目录的 `src/app`（而非文中设想的 `hunter/skillhub` 子目录）。新增了 `GET /install.sh` 命令行安装引导脚本；本地 24h 版本检查实现在客户包的 `doctor.mjs`（csk 仓库）。部署见 `docs/DEPLOYMENT.md`。

## 1. 部署结构

SkillHub 作为 `hunter/skillhub` 下的独立 Next.js 全栈项目部署到 Zeabur，并连接一个独立 PostgreSQL 服务。Hunter 私有 Git 仓库继续作为 Skill 内容的唯一来源。

```text
浏览器
  └─ Next.js（展示、登录、授权、安装 API、管理后台）
       ├─ PostgreSQL（账号、授权、令牌、版本、审计）
       └─ 私有发布包存储 / 签名下载地址

本地 Agent
  ├─ 使用一次性令牌安装发布包
  ├─ 使用可撤销凭据检查与下载更新
  └─ 日常执行完全在本地，不连接 SkillHub
```

## 2. 核心接口

- `POST /api/auth/login`：邮箱密码登录并建立安全会话。
- `GET /api/products`：公开商品和能力说明。
- `POST /api/install-tokens`：为有权用户签发一次性安装令牌。
- `POST /api/install-tokens/:token/redeem`：兑换令牌，返回限时发布包地址和更新凭据。
- `GET /api/releases/latest?product=...`：公开最新版本号、发布日期和更新摘要。
- `POST /api/updates/authorize`：校验更新凭据和授权，返回限时发布包地址。
- `/admin/*`：用户、授权、版本和审计管理，仅管理员可用。

接口命名是实现建议，开发时可按 Next.js Route Handler 约定细化。

## 3. 发布流程

1. 在 Hunter 私有 Git 仓库维护 Skills，`SKILL.md` 是内容唯一来源。
2. 通过版本号和 Git tag 固化发布内容。
3. CI 或发布脚本生成不可变压缩包并计算 SHA-256。
4. 发布包上传到私有存储，数据库写入版本、哈希和更新摘要。
5. 管理员将版本标记为正式发布。

管理后台不直接编辑 Skill 文件，也不承担 Git 仓库职责。

## 4. 安全要求

- 密码使用强哈希算法存储；会话 Cookie 开启 `HttpOnly`、`Secure` 和合适的 `SameSite`。
- 安装令牌只保存哈希，默认 10 分钟失效，成功兑换后立即作废。
- 更新凭据只保存哈希，可按用户或授权撤销，不携带设备指纹。
- 下载地址应限时、不可猜测；安装器必须校验发布包 SHA-256。
- 管理接口执行角色校验，并记录授权变更和令牌相关操作。
- 日志不得记录明文令牌、密码、JD、候选人信息或浏览器登录态。

## 5. 本地更新检查

每个 Hunter Skill 可在合适的入口触发轻量检查：

1. 读取本地缓存；24 小时内不再次访问网络。
2. 请求公开版本元数据，不发送业务内容。
3. 网络失败或服务不可用时静默继续当前工作。
4. 发现新版本时提示用户；取得确认后才校验授权并更新。
5. 更新前备份当前版本，安装后运行诊断，失败时回滚。

这个机制借鉴 gstack 的低打扰检查方式，但保留 Hunter 的付费更新授权边界。

## 6. Zeabur 配置

- 一个 Next.js 服务，根目录指向 `skillhub/`。
- 一个 PostgreSQL 服务，通过 `DATABASE_URL` 连接。
- 生产环境设置会话密钥、首位管理员和公开站点地址。
- 域名、对象存储和 CI 发布在第二阶段接入；MVP 不在仓库中保存生产密钥。
