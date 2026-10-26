# LinkedIn OpenCLI 插件入口

新增30个命令统一归入 `hunter-linkedin`：19个任务命令、11个 `salesnav-` 命令。
原有15个 Hunter 命令及 `linkedin` 站点命令保持不变。注册真源为 `src/plugin/commands.json`，参数字段也保存在此处；`opencli-commands.js` 负责注册，`src/plugin/runner.mjs` 负责传参及原执行器回执转换。

## 安装与使用

在已安装 OpenCLI 2.0.1 的机器上，从解压后的包目录安装：

```bash
opencli plugin install file:///absolute/path/to/package
opencli hunter-linkedin capabilities -f json
opencli hunter-linkedin salesnav-capabilities -f json
opencli hunter-linkedin task-status --input status.json -f json
opencli hunter-linkedin salesnav-account-search --input search.json -f json
opencli hunter-linkedin task-status --help -f json
```

安装会新增用户级插件注册，并链接当前目录；不要删除或移动包目录。开发验证未改全局OpenCLI核心或旧插件。本机已获用户授权安装，30个新增命令已通过不带开发加载器的原生OpenCLI验证。

`status.json`：

```json
{"directory":"/absolute/path/to/task","task_id":"your-task-id"}
```

搜索文件遵循已有账号绑定、filters、limit、max_pages契约。使用 `salesnav-capabilities` 获取字段目录；`--help` 展示输入文件字段。除普通 `capabilities` 不接受输入文件外，其余新增命令使用 `--input` 文件；SalesNav capabilities与doctor可省略。不要用通用 `--profile` 代替文件中的账号绑定；文件绑定是执行器唯一账号依据。

## 分层与兼容

OpenCLI命令 → 参数文件校验 → 原有Node执行器 → 原子平台能力 / 本地账本。
保留旧Node入口供内部调用和兼容，用户与Skill优先使用OpenCLI入口。插件不新增平台发送操作；任务准备联系名单仅写本地文件。`access:write`表示本地任务/报告写入，不代表发送消息授权。

失败保持非零退出及原错误码；部分采集保持partial，不转换成全量成功。浏览器所有权、身份核验、预算与中断恢复仍由现有执行器负责。安装并不提供SalesNav权益。

## 本轮验证范围

- 225项本地测试通过（包含7项新增插件契约/真实本地执行器测试）。
- 项目隔离插件目录通过OpenCLI真实发现和命令分发检查；逐条30个help和27个必填输入门槛。
- 两个能力目录、任务创建和状态读取通过插件入口执行。
- 历史网站实测沿用原执行器证据，不声称本轮重新验证全部网站命令。
- 原生插件安装后：30个help、27个必填参数门槛、两个能力目录、task-create/status全部通过。旧scout与whoami帮助仍正常。
- 2026-10-25用户连接后，在可访问本地桥接的执行环境确认Profile在线；原生salesnav-batch通过公司详情、人员任职、公司搜索、人员搜索4项只读实测。搜索各限1条，非全量；共1个自有会话且正常关闭。沙箱内诊断曾返回假性断连。

证据保存在 `.local/opencli-integration/`；命令与验证表为 `workflow-runs/linkedin-integration/CLI_MATRIX.html`。

## 重跑入口验收

```bash
npm test
node scripts/verify-opencli-plugin.mjs --opencli-entry /absolute/path/to/opencli
```

第二条使用项目内插件目录，经当前OpenCLI的实际发现器和命令分发执行，不写用户级插件注册。它验证命令注册、必填项以及本地任务闭环，不启动网站搜索。加 `--installed` 可验证已安装的原生命令，不注入开发加载器。

## 补齐Hunter组合能力（2026-10-25）

新增 `discover-linkedin-xray`、`enrich-linkedin-profiles`、`collect-outreach-context`、`execute-approved-outreach`、`summarize-outreach-batch`、`create-email-draft` 六个OpenCLI入口。插件共36个新增入口，原有命令保持不变。

六个入口复用现有Hunter Skill脚本，不复制业务判断或绕过上游审批。默认根据已安装hunter-linkedin插件定位其skills目录；独立部署可设置 `HUNTER_SKILLS_ROOT` 为绝对路径，缺少依赖返回dependency_missing。后四个命令另需 `--output-dir`。输入字段与输出见 [LinkedIn CLI命令表](../workflow-runs/linkedin-integration/CLI_MATRIX.html)。

X-ray和批量补充输入文件包含脚本选项；其余四个传原业务JSON。X-ray的布尔值是真正JSON布尔值；enrich的include是逗号分隔字符串。执行发送仍要求执行标记及原脚本对目标、内容哈希、渠道和当前对话审批的完整校验。

验收：229项本地测试；六个已安装入口的help/必填项通过；合成联系汇总真实脚本生成文件；发送在缺少execute及缺少上游审批时分别拒绝。未发送，未生成邮件正文；未把help通过当成完整网站流程已通过。

命令表真源改为 `docs/reference/linkedin-cli-catalog.json`，运行 `python3 scripts/build-cli-matrix.py` 重建。覆盖检查要求已注册命令均在表中，开发维护工具单独呈现，防止再按源码目录漏掉业务能力。
