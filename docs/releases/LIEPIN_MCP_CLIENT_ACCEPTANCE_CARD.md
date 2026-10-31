# 目标助手只读验收卡（尚未执行）

本卡只验证目标助手真实发现并调用已安装的官方opencli-mcp猎聘Adapter，不启动新寻访、不读取简历。Claude Code此前已由用户明确暂缓，本卡不授权启动。WorkBuddy须使用桌面助手本身，不能用同名终端业务系统CLI替代。

## 最新候选与真机环境分别记录

| 对象 | 当前来源 | 已有证据 |
| --- | --- | --- |
| 待交付0.3.0候选 | 产品源码37f8583f；CI配置修复0e614b18；指纹d8bd7bdc35788ad246f0b99b86d945c8d824c9ec938876b4b453949f82bf752f | CI运行39532561247：Windows与macOS Intel均通过；本机ARM64重建同指纹。Windows注册表为注入契约，未连接真实Chrome |
| 当前已安装浏览器宿主 | eddde4b9 / 2b7808b3 | 历史真实搜索、分页、详情及收藏证据；没有自动升级到新候选 |

下文临时MCP配置指向当前真机宿主，只能证明该宿主的客户端调用；不能写成d8bd7bdc候选已完成客户端验收。若后续验收新候选，须先核对实际安装回执与连接版本，再生成其配置，不手动替换指纹字符串冒充安装。

## 已安装真机基线（保留追溯）

- 版本0.3.0，源码eddde4b9。
- 指纹：2b7808b35f77f708cf2949dcd78af994d1a25131f6b0eb4fcd3f1fbd94ce5913。
- 当前兼容扩展保持启用，不新增扩展、不改Native Messaging白名单。
- 不写全局客户端配置。若目标客户端必须修改配置才能接入，先向用户呈现具体差异。

## 最小调用

在目标助手的临时项目MCP配置中，使用当前安装回执生成的command和args（见下）。让助手仅通过官方sites发现liepin工具，再调用一次tabs。不得读取页面正文、简历、搜索、翻页、收藏或发消息。

```json
{
  "mcpServers": {
    "liepin-acceptance": {
      "command": "/Users/shawnruan/.nvm/versions/node/v22.23.2/bin/node",
      "args": [
        "/Users/shawnruan/coding-proj/hunter-works/.liepin-install-state/outcome-v030/browser/hosts/2b7808b35f77f708cf2949dcd78af994d1a25131f6b0eb4fcd3f1fbd94ce5913-0e493d5684a1/dispatch.mjs",
        "stdio"
      ]
    }
  }
}
```

成功证据必须包含：实际目标助手名称/版本、工具发现、一次正式liepin.tabs结果或明确连接报错、对应候选指纹、是否修改客户端配置。不能用本地BrowserClient成功或MCP初始化代替目标助手执行。空标签列表只证明工具可调用，不能证明猎聘页面业务成功；此次验收本就不执行招聘业务。

## 当前外部条件

2026-10-21只读核对：本机有WorkBuddy.app和Claude.app；终端workbuddy --help为业务系统的jobs/crm等CLI，不能当作桌面助手。未发现pwsh/powershell/wine/docker可执行入口，未具备本机Windows验收条件。此结果不等于检查了所有远程环境，也不代表助手已完成调用。

本卡仅为准备结果。Windows环境、Claude Code测试及Zeabur登录沿用用户此前暂缓决定；不会自动启动助手或修改配置来清除这些未验项。

## 尚未收口的三项实际门

| 验收门 | 已有证据不能替代什么 | 所需实际证明 | 当前约束 |
| --- | --- | --- | --- |
| Windows Chrome接入 | 云端22项安装和注入注册表不能证明真实Native Messaging连接 | Windows安装回执、真实HKCU/清单核对、Chrome扩展ID、Adapter连接及授权的首次业务结果 | 用户暂时没有Windows环境，保留未验 |
| 目标助手首次调用 | 本地MCP initialize不能证明助手已发现和调用工具 | 实际助手名称/版本、对应宿主指纹、正式工具发现与一次tabs回执；业务任务另记 | Claude Code用户已暂缓；WorkBuddy桌面首次调用未验，不使用同名终端CLI代替 |
| Zeabur维护入口 | 本地构建及数据库合成测试不能证明线上容器维护文件存在 | 已登录CLI对现有服务的只读维护入口核对及回滚路径证据 | 用户已暂缓登录；不绕过身份验证、不部署 |

三个门尚未完成。此卡不发起新的安装、客户端启动、账号动作或发布授权请求；用户恢复相应条件后从对应门接续，不重跑已通过的其他门。
