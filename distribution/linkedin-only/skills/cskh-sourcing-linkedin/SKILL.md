---
name: cskh-sourcing-linkedin
description: 已确认招聘寻访需求的兼容入口，将 SourcingRequest 转交统一 cskh-linkedin 任务流程，保留原始画像与条件。
---

# LinkedIn 招聘兼容入口

这是 LinkedIn 2.1.0 统一包中的招聘兼容入口，保留原有寻访脚本。

1. 恢复用户已确认的 SourcingRequest、persona、searchParameters、channelPlans，不重新要求已经完成的确认。未确认的关键条件先明确，不伪造 confirmed。
2. 阅读同包 `../cskh-linkedin/SKILL.md`，沿用统一流程，不串行执行第二套完整寻访流程。
3. 模型将原请求映射为 people_discovery 任务，逐项保留硬条件与偏好、目标数量、证据口径，原始请求一并保存。不能从一个案例固化行业、地点、数量或关键词。
4. 从本目录执行 `node scripts/opencli.mjs hunter-linkedin task-import-sourcing --input input.json -f json`。输入包括 directory、confirmed:true、sourcing_request、task、mapping_note。confirmed 只能来自用户已有确认。
5. 后续使用 task-execute、task-status、task-assess、task-report。平台操作按实际可用能力选择；不默认强制 X-Ray。未接入的 Recruiter/X-Ray 明确标为不支持，不能悄悄换条件。
6. 输出人员表格、证据及具体缺口；初选不等于最终符合。平台原有执行器和全局工具不修改。

## OpenCLI 统一入口

客户调用统一通过 `node scripts/opencli.mjs hunter-linkedin <command> --input input.json -f json` 调用；SalesNav命令加 `salesnav-` 前缀。先确认插件已安装并检查 `--help`；安装未完成时不得声称命令已可用。账号绑定仍来自输入文件，不能以全局Profile选项覆盖。安装与字段规则见 `../../docs/OPENCLI_PLUGIN.md`。内部 Node 入口仅供开发诊断，客户任务不要直接调用。


## 安装后调用

从本 Skill 目录运行 `node scripts/opencli.mjs hunter-linkedin --help`，可查看全部命令。该入口使用产品自带的固定运行时；不要改用其他全局安装版本。Sales Navigator 需要当前账号实际具备权限，普通 LinkedIn 不需要订阅 Sales Navigator。
