# 猎聘跨平台CI验收申请（不含上线）

2026-10-21。当前仍不具备正式上线条件；本申请仅补充Windows/macOS云端源码、回归与安装证据。需用户确认后执行外部GitHub写入。

| 项目 | 本次范围 |
| --- | --- |
| GitHub目标 | capparun/skillhub，新增分支codex/liepin-ci-acceptance |
| 固定提交 | 10776eff，本地主分支基线8c34d3fe |
| 推送范围 | 281文件完整猎聘来源，相对最新main有222文件差异；仅distribution/liepin-search、tools/liepin-mcp、两个PRD及专用workflow |
| 保留 | src/、Java后端、旧web/、其他产品页面、根依赖、部署脚本和Dockerfile均无差异 |
| 自动工作流 | 仅Liepin Adapter platform acceptance；Windows/macOS两runner，Node22 |
| 检查内容 | 先安装核心依赖并独立重建源码，执行核心与MCP测试，再验证0.3.0正式候选安装；上传两份验收JSON |
| CI修复 | 旧workflow只跑MCP、缺少核心依赖准备；已改为完整verify-source-delivery入口；增加仅此专用分支的push触发 |
| 本地依据 | 专用分支独立验收：核心386/MCP194通过；281文件正式重建匹配当前2b7808b3候选 |
| 隐私依据 | 源码清单排除evidence/output/运行目录；本轮52个已知简历稳定ID命中0；无原始简历、私有报告或本机配置 |
| 权限与不执行 | workflow只有contents:read；不合并main、不创建发布、不推标签、不发Zeabur、不改现用浏览器和账号 |
| 自动部署核对 | 现有镜像发布依赖release或手动触发，文档部署只匹配main，测试部署为手动触发；此分支push不匹配这些部署条件 |
| 清理/失败 | CI失败保留日志与分支供修复；不自动合并或触发生产回滚 |
| 不能替代 | Windows真实Chrome/Native Messaging、目标助手首次业务、Zeabur维护核对。Windows安装检查中的注册表目前是注入契约测试，不写成真实注册表验收 |

此申请不代表已经推送或CI通过。推送后的远端commit、job结果及artifact必须另行核对。允许本申请也不等于批准正式上线。
