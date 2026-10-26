# LinkedIn 整合候选 dev.14

开发候选，未正式发布。普通LinkedIn依赖外部Hunter launcher；SalesNav依赖OpenCLI 2.0.1、Chrome及已连接扩展。Node.js 22+。不包含外部Hunter源码或真实账号回执。

## 使用

解压tgz到持久目录后，在package目录运行：

```sh
node scripts/install-skill.mjs --project /absolute/project --skill cskh-linkedin
node src/linkedin-cli.mjs capabilities
```

账号和需求参数由用户指定，不把SalesNav当作所有账号默认权益。平台操作和业务判断分开；消息与邀请不属于本包自动执行范围。

## 新能力与输入输出

所有任务命令：`node src/linkedin-cli.mjs COMMAND input.json`。

| 命令 | 输入 | 输出 |
|---|---|---|
| task-recovery | directory、task_id | 已完成详情、待处理人员、诊断要求；不执行平台操作 |
| task-resume | 原任务directory/task_id、operation_id、当前evidence_revision、person_keys | 原账本内有界详情读取；不重置账号、预算，不自动解除中断 |
| task-consolidate | 输出directory、report_id、sources | HTML、CSV、来源版本清单，按实体去重并核对数量 |
| person.read（平台操作） | 精确人员链接，可选include_about:false | 当前任职；About为not_requested，不假装读取完整简介 |

合并示例（替换路径与任务/评估ID）：

```json
{"directory":"/absolute/output","report_id":"combined","sources":[{"directory":"/absolute/task-a","task_id":"a","assessment_id":"review"},{"directory":"/absolute/task-b","task_id":"b","assessment_id":"review"}]}
```

sources须具有相同账号、意图和标准；评估版本过期拒绝。输出目录须已存在，不覆盖旧报告。跨批次汇总不会抹除历史操作中断，也不代表新的平台采集。

## 验证和限制

打包前218项本地测试通过；此前24个隔离浏览器场景和真实账号小样本有本地证据。公司页无效重定向不再当成功；真实公司slug须观察得到，不能由展示名称猜测。

仍不承诺：所有筛选组合、所有账号套餐、免费账号、RPS、跨操作系统、未诊断中断后的自动恢复。原生点击对可见标签仍有要求；按需读取任职可避免不必要的About展开。旧组合工作流不能由原子能力通过推导端到端通过。

制品manifest记录源码快照、文件哈希、测试数量。独立本地快照提交不是原仓库提交或远端发布。使用详情见ATOMIC_CAPABILITIES.md和skills/cskh-linkedin/SKILL.md。
