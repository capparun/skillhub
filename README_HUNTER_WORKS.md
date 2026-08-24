# 猎策 Hunter Works

面向 SOHO 猎头的 Hunter 官方 Skill 展示、安装、授权和更新站点。

## 当前阶段

当前仓库包含：

- SkillHub 首页和业务能力展示；
- “Agent 用户 / 命令行用户”安装交互原型；
- 登录后的安装 Prompt 与命令复制体验；
- MVP 产品规格、架构说明和 PostgreSQL 数据模型草案。

当前页面中的登录、授权和一次性令牌是前端交互原型，尚未接入真实账号、数据库和私有发布包。页面不会收集或上传 JD、候选人和浏览器登录态。

## 本地运行

```bash
npm install --ignore-scripts
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 验证

```bash
npm run lint
npm run build
```

## 文档

- `docs/PRODUCT_SPEC.md`：MVP 产品边界和验收标准。
- `docs/ARCHITECTURE.md`：Zeabur、PostgreSQL、安装和更新架构。
- `db/schema.sql`：首版数据库模型草案。

## 部署目标

项目计划部署到 Zeabur：一个 Next.js 服务连接一个 PostgreSQL 服务。生产密钥只通过 Zeabur 环境变量配置，不写入仓库。
