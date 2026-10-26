# LinkedIn 整合候选 dev.13 使用清单

2026-10-25。开发候选，不是正式发布。源码来自本地工作文件的固定快照；快照Git提交用于复现，不代表原仓库已提交或远端同步。制品哈希与文件清单见同目录manifest.json。

## 安装与依赖

1. 将候选tgz解压到持久目录（解压后为package目录），不要放在会自动清理的临时目录。
2. 准备Node.js 22+；SalesNav适配器使用PATH中的OpenCLI（已验证2.0.1）与Chrome扩展1.0.26。当前环境不是跨版本兼容保证。
3. 普通LinkedIn需要外部Hunter的 `scripts/opencli.mjs`，以绝对路径设置HUNTER_OPENCLI_ENTRY；已验收的外部运行时固定OpenCLI 2.0.0。该运行时和旧cskh-outreach不包含在本包中，不应将包宣传为零外部依赖。
4. 在解压目录执行 `node scripts/install-skill.mjs --project /absolute/your-project --skill cskh-linkedin`。此安装仅在该项目创建Skill链接，不修改全局设置；包移动后须重新检查链接。
5. 打开正确Chrome Profile并连接扩展，确认LinkedIn身份；不要求所有账号都有SalesNav。RPS尚未开发。

## 从哪里开始

以下均在解压后的package目录执行，input.json是你准备的输入文件。`docs/LINKEDIN_ROUTE_OPTIONS.md`有新命令契约；`docs/ATOMIC_CAPABILITIES.md`有任务与平台参数示例。

| 你要做什么 | 命令 |
|---|---|
| 看已接入的平台操作 | `node src/linkedin-cli.mjs capabilities` |
| 查当前账号；需要时读订阅页 | `node src/linkedin-cli.mjs account-inspect input.json` |
| 比较已有权限证据支持的操作 | `node src/linkedin-cli.mjs route-options input.json` |
| 创建/执行/恢复任务 | `task-create` / `task-execute` / `task-status`（同一CLI入口） |
| 记录模型评估、输出表格 | `task-assess` / `task-report` |
| 准备联系名单 | `task-prepare-outreach` |
| 转成旧招聘Outreach的单人输入 | `task-outreach-input` |

账号检查输入示例（替换为实际已确认身份，不要直接运行占位数据）：

```json
{"account":{"profile":"YOUR_PROFILE","expected_identity":"YOUR_NAME","expected_profile_url":"https://www.linkedin.com/in/YOUR_SLUG/"},"include_subscription":true,"candidates":[{"provider":"linkedin","operation":"person.search","input":{"keyword":"YOUR_QUERY","limit":3}}]}
```

account-inspect只检查，不执行上述搜索。默认不读订阅页；include_subscription:true才读。英文Plan Details匹配不到时保持未知。余额为unknown不等于0，续期不是InMail重置日期。普通搜索权限不会因为身份或付费标签自动变成已确认。

## 实际验证范围

- 普通搜索误判外部补丁已应用；一次真实搜索返回3人，原页先解析9人，limit仅限制返回量。
- 复用名单深读1人，独立经历返回9段；历史任职不等于现任。报告基于恢复真实回执生成，未宣称全量自动业务E2E。
- 账号检查及SN套餐、续期读取已通过真实账号验证；可见余额未读取到，保持未知。
- 名单版本检查、输入转换、未批准不读取关系：合成验证；没有真实发送。
- 候选包验证：独立解压，3Skill安装、2CLI加载、链接与相关行为检查。只代表本次macOS/Node环境，不外推其他系统与Agent。

## 明确未完成

免费账号实测、普通Premium其他套餐页面、RPS、通用商务触达、获准后的真实关系读取与发送、所有高级筛选逐项实测、页面视觉验收、原仓库提交与远端同步、正式发布。外部Hunter补丁及Outreach需独立版本管理，本包不包含它们。

[业务总图](BUSINESS_CAPABILITY_MAP.html) · [能力手册](ATOMIC_CAPABILITIES.md) · [命令契约](LINKEDIN_ROUTE_OPTIONS.md)
