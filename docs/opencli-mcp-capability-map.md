# opencli-mcp 能力与边界（0.0.30，2026-10-22 实测整理）

本文件记录我们依赖的浏览器自动化框架 opencli-mcp 的真实能力面和我们代码实际使用的边界。
依据：安装包内 `docs/`（api-reference、tab-lifecycle、sites、errors、js-tool、capabilities/*）、
`adapter-sdk/index.d.ts`（适配器契约的唯一真源），以及本机实测（2026-10-22）。

## 1. 进程模型

```
MCP 客户端（stdio）
   └─ dispatch.mjs ──> opencli-mcp/dist/src/main.js   （每客户端一个进程）
          └─ IPC socket 连接「浏览器宿主」
                 ~/.opencli-mcp/run/<uuid>.json 记录 pid + socket + browserId
                 宿主进程 cwd 落在某个安装的 browser/hosts/<指纹>-<hash>/
                 └─ Chrome 扩展（native messaging）
                        ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.opencli.mcp.json
                        的 path 指向某个安装的 browser/hosts/.../launcher
                        └─ 页面（tab）
```

关键事实：

- **宿主是长驻进程**，按 pid 存活判定复用；MCP 客户端连上已存在的宿主，而不是自建。
- **适配器代码在宿主进程内执行**。因此宿主来自哪个安装，决定了实际跑哪份适配器。
- native messaging 清单里的 `path` 在安装时写入，**不会随后续安装自动更新**（详见交接文档 11.3 的陷阱）。

## 2. 标签归属（踩过坑的地方）

| 对象 | 归属 | 可用操作 |
| --- | --- | --- |
| `browser.tabs.new()` 创建的标签 | 本会话 agent | `tab.act/evaluate/url/close/release` |
| `browser.user.claimTab({tabId})` | 仅限**用户标签**（先 `browser.user.openTabs` 发现） | claim 后同上；`expectedUrl` 校验当前身份 |
| 站点适配器绑定的标签 | 站点会话（如 `site:liepin`） | 只能通过该站点的 `sites.run` 命令操作 |

- 适配器会话持有的页面，客户端直接 `tab.url()`/`tab.act()` 会报 `page belongs to session site:liepin`；
  `browser.user.claimTab` 会报 `claim_not_allowed`。**这是设计，不是故障。**
- `tab.release()` 保留页面、放弃控制；`browser.tabs.finalize()` 结束会话；崩溃的客户端会留下
  会话租约，此时 `browser.user.closeTabs` 拒绝关闭（`Tab is gone or controlled by a session`），
  只能用 `browser.chrome.call('tabs.remove',[id])` 兜底。
- 页面 handle 在导航期间稳定，标签关闭后失效（`stale_page`）。

## 3. 适配器契约（adapter-sdk/index.d.ts 是唯一真源）

```ts
defineAdapter({ description, access:'read'|'write', domain?, args, aliases?, run(ctx) })
ctx = { args, tab, sites, recon, signal }
```

- 适配器目录：包内 `adapters/<site>/<command>.js`（builtin）+ `~/.opencli-mcp/adapters/<site>/`（用户覆盖，后者优先）。
  我们的 liepin 适配器是 builtin 壳，`export {default} from '../../../../tools/liepin-mcp/adapters/liepin/xxx.js'`。
- 调用方式：`sites.run(site, name, args)`，或 `sites.enable(site,{write:true})` 后走 `<site>_<command>` 工具。
- `tab` 与 `js` 工具里的 Tab 同一套面；适配器只能看到 `adapter-sdk` 声明的子集。

## 4. 交互成本模型（实测，2026-10-22）

`tab.act` = 定位 → 等可操作 → hit-test → 真实输入 → settle。单次动作的墙钟：

| 动作 | 耗时 | 说明 |
| --- | --- | --- |
| `tab.evaluate` | 4–15ms | 基础往返 |
| `tab.url()` | 8–20ms | |
| `hover`（settleMs=150） | 214–238ms | 1 次鼠标事件 |
| `click`（cdp） | 659–686ms | `armClickProbe` + mouseMoved/Pressed/Released + `readClickProbe`，约 5 次跨进程调用 |
| `click`（`method:'dom'`） | 613–615ms | 只省约 45ms |

`settleMs` 生效但只占其中约 150ms；点击的固定部分来自扩展的落地探测与导航观察窗，
**适配器层无法压缩，只能减少点击次数**。

## 5. 我们代码实际使用的面

搜索链路（`lib/search-driver.js` → `createSearchDriver`）是**封闭能力面**，代码注释即契约：

> Fixed capability adapter. No arbitrary evaluate, navigation, network replay, capture fallback
> or access to the underlying OpenCLI Page escapes this object.

只暴露：固定只读观察器（`inspect`/`inspectRecords`）+ 固定动作（click/fillText/hover/scrollTo/scroll/Escape）。
收藏链路（`tools/liepin-mcp/lib/site-adapter-favorite.mjs`）用 `tab.evaluate(inspectFavorite)` + `tab.act({action:'click',settleMs})`。

框架提供但**我们的驱动刻意不用**的能力：`tab.fetchJson`（经页面调用站点自身 API）、`tab.expect`
（轮询断言）、`tab.network.*`（被动捕获）、`recon.discover`（端点发现）、任意 `evaluate`、导航。

含义：性能优化只能落在「减少点击次数」和「把固定 sleep 换成事件驱动」上；
走站点 API 的快速通道与当前防检测姿态（只发真实用户输入、不重放接口）相冲突，属于产品决策，不是工程优化。

## 6. 错误码要点（按 code 分支，不按 message）

- `claim_not_allowed` / `page belongs to session`：想把适配器页面当用户页面操作。
- `page_released` / `stale_page`：finalize 或关闭后仍用旧 handle。
- `command_outcome_unknown` / `not_delivered`：动作可能已生效或未送达，先观察再决定，不自动重放。
- `js_busy`：上一个 JS 调用未返回（元素解析超时后会出现，见交接文档 11.4）。
- `host_unavailable`：Chrome 未启动或宿主未连；先查 `~/.opencli-mcp/run/`。
