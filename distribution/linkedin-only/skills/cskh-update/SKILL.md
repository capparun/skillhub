---
name: cskh-update
description: |
  检查或更新已安装的猎策能力。用户说“更新猎策”“升级猎策”“检查猎策更新”
  或询问猎策是否有新版本时使用。通过安装器登记的真实路径调用官方更新器。
type: skill
version: 1.1.1
status: ready
disable: false
---

# cskh-update：猎策更新

本 Skill 只负责识别更新意图并调用安装时登记的 Hunter 更新器。下载、版本比较、完整性校验、备份、覆盖安装、Doctor 和失败回滚均由官方更新器或官方安装引导处理，不在 Skill 中重复实现。

## 执行

先定位本 `SKILL.md` 所在目录。

先识别当前操作系统。**Windows 上不得探测或调用 Bash、Git Bash、WSL，也不得先运行 Bash 再降级 PowerShell。** `run-update.mjs` 是跨平台 Node 脚本，应通过宿主的直接进程执行能力启动；宿主只能使用终端时，Windows 明确选择 PowerShell，并直接运行 `node`。不要把下列 Node 命令包装为 `bash -lc`、`.sh` 或其他 Bash 调用。

- 用户明确说“更新猎策”或“升级猎策”时，直接执行，不再二次询问：

  ```text
  node "<本 Skill 目录>/scripts/run-update.mjs"
  ```

- 用户只问“检查猎策更新”“猎策有新版本吗”时，只检查，不安装：

  ```text
  node "<本 Skill 目录>/scripts/run-update.mjs" --check
  ```

Windows PowerShell 中可直接执行 `& node "<本 Skill 目录>/scripts/run-update.mjs"`（检查模式追加 `--check`）。必须等待命令结束，并根据真实退出状态回复。不要猜测 `~/.hunter`、项目 `.hunter` 或其他安装路径；脚本会读取安装器写入本 Skill 的路径指针。

## 早期版本恢复

如果 `run-update.mjs` 明确报告安装路径指针、安装回执或更新器缺失，说明这是不具备更新组件的早期安装。不得搜索或猜测用户的 Skill 安装目录，改走线上官方安装引导重新安装当前产品 `soho-sourcing`；新安装器会识别 Agent 的真实目录，并补齐回执和更新器。

- 用户只是“检查更新”：按系统执行以下只读请求，只报告响应中的线上最新版本；由于本地回执缺失，明确说明无法可靠比较本地版本，不得安装。

  macOS / Linux：

  ```bash
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
    'https://hunterskill.zeabur.app/api/releases/latest?product=soho-sourcing'
  ```

  Windows PowerShell：

  ```powershell
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-RestMethod 'https://hunterskill.zeabur.app/api/releases/latest?product=soho-sourcing' -MaximumRedirection 0
  ```

- 用户明确要求“更新/升级”：先识别操作系统，再执行对应的官方引导，不再二次确认：

  macOS / Linux：

  ```bash
  HUNTER_UPDATE_TMP="$(mktemp -d)" || exit 1
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
    https://hunterskill.zeabur.app/install.sh \
    --output "$HUNTER_UPDATE_TMP/install.sh" || exit 1
  bash "$HUNTER_UPDATE_TMP/install.sh" soho-sourcing
  HUNTER_UPDATE_STATUS=$?
  rm "$HUNTER_UPDATE_TMP/install.sh"
  rmdir "$HUNTER_UPDATE_TMP"
  exit $HUNTER_UPDATE_STATUS
  ```

  Windows PowerShell：

  ```powershell
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('hunter-install-' + [guid]::NewGuid() + '.ps1')
  try {
    Invoke-WebRequest 'https://hunterskill.zeabur.app/install.ps1' -MaximumRedirection 0 -OutFile $script
    & $script -Product 'soho-sourcing'
    if ($LASTEXITCODE -ne 0) { throw "猎策安装引导失败，退出码：$LASTEXITCODE" }
  } finally {
    Remove-Item $script -Force -ErrorAction SilentlyContinue
  }
  ```

必须使用 HTTPS 官方域名；引导脚本请求不得跟随重定向，也不得跳过安装引导内的 SHA-256 校验和 Doctor。线上请求失败时停止并报告真实错误；不要退回到手工复制 Skill 文件。

## 回复

- 更新成功：说明旧版本、新版本和 Doctor 是否通过。
- 已是最新版：说明当前真实版本，无需更新。
- 只检查且发现新版：说明当前版本和最新版本，并等待用户明确要求更新。
- 失败：简述真实原因；不得声称已更新，也不要绕过校验或 Doctor。

更新完成后，提醒用户新建对话或重载 Agent，使新版 Skill 生效。
