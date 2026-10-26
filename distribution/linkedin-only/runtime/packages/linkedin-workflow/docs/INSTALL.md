# 候选包安装与首次任务

这是开发候选版，完整验收台账尚未关闭。当前验证环境是 macOS、Node.js 22.23.2、OpenCLI 2.0.1、Chrome 扩展 1.0.26。项目内 Skill 路径和 CLI 可以独立使用；自动 UI 索引、Windows 和其他 Agent 尚未验证。

## 获取与校验

开发者提供 `.tgz` 与同目录 `manifest.json`。清单包含源码提交、逐文件 SHA256、包 SHA256、构建 Node 版本和离线测试结果。它不代表全部真实业务验收通过。

在干净开发仓库执行 `npm run package:candidate` 生成候选；输出在忽略的 output/candidates 目录，不上传真实回执。构建会拒绝未提交修改、非跟踪文件混入包、敏感文件名和覆盖已有候选。

## 项目内安装

选择一个用于本任务的项目目录，使用候选包的实际绝对路径：

```sh
npm install --prefix "<项目目录>" --ignore-scripts --no-audit --no-fund --cache "<项目目录>/.npm-cache" "<候选包绝对路径.tgz>"
node "<项目目录>/node_modules/@cskh/linkedin-salesnav/scripts/install-skill.mjs" --project "<项目目录>"
```

安装器只创建本项目 `.agents/skills/cskh-linkedin-salesnav` 到已安装包的链接。不覆盖已有 Skill，不修改全局 OpenCLI 或订阅；如果 `.agents` 指向共享位置，会返回 unsafe_project_path。

在 Codex 中明确读取本项目 `.agents/skills/cskh-linkedin-salesnav/SKILL.md`。当前已验证的调用方式是按安装路径读取 Skill 并执行其 CLI；不要把文件存在外推成所有宿主的自动发现已通过。

## 首次诊断和只读任务

可以在项目根目录执行：

```sh
./node_modules/.bin/cskh-linkedin-salesnav doctor
./node_modules/.bin/cskh-linkedin-salesnav capabilities
```

doctor 返回已连接 Profile。提供希望使用的 LinkedIn 完整显示名和明确 Profile；先执行 account-check，核对自有资料 URL、SalesNav 及两类搜索能力。连接、套餐、余额和可执行性分开判断。

首次提示词示例：

> 读取本项目的 cskh-linkedin-salesnav Skill。使用我指定的 Chrome Profile 和 LinkedIn 身份先检查 SalesNav 权限。只读查询 dental 或 ophthalmic 公司，规模 51–200，先获取 3 家，再读取其中一家详情。列出事实、来源、未确认之处，导出本地 JSON/CSV/Markdown。

这只是首次功能验证，不等于三家公司都符合某个业务画像。行业、总部、人员所在地和区域团队规模不能互相替代。

需要整页或更多结果时，明确 max_pages、limit 和本地 request_budget。部分数据带 cursor 时可以 search-page 继续；limit 是累计唯一记录总目标。检查点有效期 30 分钟且绑定版本；更换业务条件必须新建查询。

## 结果与排错

- complete_available_window 仅表示读完平台可见窗口，不代表全部匹配结果。
- account-check 的 unknown 不等于未订阅。明确拒绝访问、登录/验证、限流或页面变化时停止依赖操作。
- profile_busy 不抢锁。确认原进程和浏览器动作已结束，再人工处理系统临时目录中的本插件锁文件。
- 检查点损坏、过期或版本不符时，保留已导出的部分结果并重新查询。
- 导出父目录必须存在；已有文件不会覆盖。先核对 error.code 和执行阶段，再使用新输出文件名重试。

真实回执、资料和业务报告保存在使用者选择的本地输出目录。检查点在系统临时目录 hunter-salesnav-checkpoints；任务结束后可按 cursor.id 删除对应文件。它们不进入源码仓库。

## 升级、回滚与移除

保留旧候选包和 manifest。升级或回滚时对同一项目重新执行 npm install 的本地包命令，再运行安装器；属于本包的已有链接可重复使用。版本变化后重新查询，不复用不兼容检查点。

先移除本包创建的 Skill 链接，再卸载项目内依赖：

```sh
node "<项目目录>/node_modules/@cskh/linkedin-salesnav/scripts/install-skill.mjs" --project "<项目目录>" --remove
npm uninstall --prefix "<项目目录>" --ignore-scripts --no-audit --no-fund --cache "<项目目录>/.npm-cache" @cskh/linkedin-salesnav
```

移除操作不删除业务报告。其他目录、其他 Skill 和全局配置不由本安装器管理。

## Agent执行环境与假断连排查

浏览器命令需要访问本机OpenCLI桥接服务localhost:19825。受限沙箱可能阻断本机通信，表现为daemonRunning=false、profile_not_connected或Failed to start opencli daemon；这些错误本身不足以证明用户未连接。先在允许访问本机桥接的环境执行profile list和doctor，明确指定目标Profile并继续核对本人身份。若端口已有监听但沙箱诊断服务停止，优先排查环境隔离，不要求用户反复打开Chrome，不重启正常服务或更换扩展。诊断只读；真实搜索仍遵守本轮已批准的次数/时间范围。
