import { env } from '@/lib/server/env';

export const runtime = 'nodejs';

function renderScript(appUrl: string): string {
  return `# Hunter Windows 安装引导脚本（由服务器生成）
param([Parameter(Mandatory=$true)][string]$Product, [string]$Token = '', [string]$NpmRegistry = '', [switch]$NpmOffline)
$ErrorActionPreference = 'Stop'
$Server = '${appUrl}'
if ($Product -eq 'maimai-only') { throw '当前脉脉寻访包仅支持 macOS / Linux；Windows 不支持实际寻访。' }
$originalLocation = Get-Location
$logDir = Join-Path ([System.IO.Path]::GetTempPath()) ('hunter-install-log-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $logDir | Out-Null
$stage = 'environment'
$transcribing = $false
try {
  if (($NpmRegistry -or $NpmOffline) -and $Product -ne 'liepin-search') { throw 'NpmRegistry/NpmOffline 当前仅用于猎聘独立安装包。' }
  if ($NpmOffline -and -not $NpmRegistry) { throw '离线npm缓存需要明确指定 -NpmRegistry，且地址须与缓存来源一致。安装包本身仍需从服务器下载。' }
  if ($NpmRegistry) {
    $registryUri = $null
    if (-not [Uri]::TryCreate($NpmRegistry, [UriKind]::Absolute, [ref]$registryUri) -or $registryUri.Scheme -ne 'https' -or $registryUri.UserInfo -or $registryUri.Query -or $registryUri.Fragment) { throw 'NpmRegistry 必须是不含凭据、查询参数的 HTTPS 地址。' }
  }
  try { Start-Transcript -Path (Join-Path $logDir 'transcript.txt') -Force | Out-Null; $transcribing = $true } catch { Write-Warning '当前宿主不支持 Transcript；阶段日志仍保留。' }
  'started: environment' | Set-Content (Join-Path $logDir 'status.txt') -Encoding utf8
  Write-Host "安装日志目录：$logDir"


$minimumNode = if ($Product -in @('liepin-search', 'gllue-only')) { 22 } else { 20 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "未找到 Node.js。请先安装 Node.js $minimumNode 或更高版本：https://nodejs.org" }
$nodeMajor = & node -p "process.versions.node.split('.')[0]"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 执行失败，请修复环境后重试。' }
if ([int]$nodeMajor -lt $minimumNode) { throw "Node.js 版本过低：$(node --version)；需要 $minimumNode 或更高版本" }

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ('hunter-install-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $workDir | Out-Null
Set-Location $workDir

$stage = 'release-metadata'
if ($Token) {
  Invoke-RestMethod -Method Post -Uri "$Server/api/install-tokens/$Token/redeem" | ConvertTo-Json -Depth 10 | Set-Content redeem.json -Encoding utf8
} else {
  Invoke-RestMethod -Uri "$Server/api/releases/latest?product=$Product" | ConvertTo-Json -Depth 10 | Set-Content redeem.json -Encoding utf8
}

$payload = Get-Content redeem.json -Raw | ConvertFrom-Json
if ($payload.error) { throw "服务器返回错误：$($payload.error.message)" }
$release = if ($payload.release) { $payload.release } else { $payload }
$downloadUrl = $payload.downloadUrl
if (-not $downloadUrl -or -not $release.sha256 -or -not $release.version) { throw '服务器响应缺少下载地址、哈希或版本信息' }

$stage = 'package-download'
Write-Host '正在下载安装包 pkg.tar.gz（SHA-256 只校验此文件，不是 install.ps1）。'
Invoke-WebRequest -Uri $downloadUrl -OutFile pkg.tar.gz
$actual = (Get-FileHash pkg.tar.gz -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $release.sha256.ToLowerInvariant()) { throw '安装包校验失败（SHA-256 不一致），已中止。' }

$stage = 'extract'
tar.exe -xzf pkg.tar.gz
if ($LASTEXITCODE -ne 0) { throw '安装包解压失败，已停止安装。' }
if (Test-Path -LiteralPath (Join-Path $workDir 'install.mjs') -PathType Leaf) {
  $packageDir = Get-Item -LiteralPath $workDir
} else {
  $packageDirs = @(Get-ChildItem -LiteralPath $workDir -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'install.mjs') -PathType Leaf })
  if ($packageDirs.Count -ne 1) { throw '安装包内容不正确：需要唯一的 install.mjs 包根目录' }
  $packageDir = $packageDirs[0]
}
if (-not (Test-Path -LiteralPath (Join-Path $packageDir.FullName 'doctor.mjs') -PathType Leaf)) { throw '安装包内容不正确：未找到 doctor.mjs' }
Set-Location $packageDir.FullName
$args = @('install.mjs', '--product', $Product, '--version', $release.version, '--server', $Server)
if ($payload.updateCredential) { $args += @('--update-credential', $payload.updateCredential) }
if ($NpmRegistry) { $args += @('--npm-registry', $NpmRegistry) }
if ($NpmOffline) { $args += '--offline' }
$stage = 'install'
$savedErrorPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = $null
  & node @args *> (Join-Path $logDir 'install.txt')
  $installExit = $global:LASTEXITCODE
} finally { $ErrorActionPreference = $savedErrorPreference }
Get-Content (Join-Path $logDir 'install.txt')
if ($installExit -ne 0) { throw "猎策安装未通过（退出码：$installExit），请保留上述报错，不要继续下一步。" }
$stage = 'doctor'
$doctorPath = Join-Path $packageDir.FullName 'doctor.mjs'
$doctorCommand = "& node '" + $doctorPath.Replace("'", "''") + "'"
$doctorCommand | Set-Content (Join-Path $logDir 'doctor-command.txt') -Encoding utf8
$savedErrorPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = $null
  & node doctor.mjs *> (Join-Path $logDir 'doctor.txt')
  $doctorExit = $global:LASTEXITCODE
} finally { $ErrorActionPreference = $savedErrorPreference }
Get-Content (Join-Path $logDir 'doctor.txt')
if ($doctorExit -eq 2) {
  Write-Host "安装步骤已返回成功，但检查未完成。请在普通 PowerShell 仅重跑检查：$doctorCommand"
  throw 'doctor 无法执行部分检查，安装状态未验证。仅执行日志目录 doctor-command.txt 中的检查命令；不要重跑安装或重复兑换令牌。'
}
if ($doctorExit -ne 0) { throw '本地安装检查未通过，请先处理上述失败项。' }
'passed: official-install-and-local-doctor' | Set-Content (Join-Path $logDir 'status.txt') -Encoding utf8
Write-Host '✓ 官方安装与本地检查通过，请返回安装页继续连接网站与使用验证。'
} catch {
  "incomplete: $stage" | Set-Content (Join-Path $logDir 'status.txt') -Encoding utf8
  $_.Exception.Message | Set-Content (Join-Path $logDir 'error.txt') -Encoding utf8
  Write-Host "流程未完成，失败阶段：$stage；日志：$logDir。分享前请去除个人路径、令牌等敏感内容。"
  throw
} finally {
  if ($transcribing) { Stop-Transcript | Out-Null }
  Set-Location $originalLocation
}
`;
}

export async function GET() {
  // Windows PowerShell 5.1 treats a UTF-8 .ps1 without BOM as the active ANSI
  // code page. The generated script contains Chinese diagnostics, so prefix a
  // UTF-8 BOM to keep downloaded files parseable on GBK Windows hosts.
  return new Response(`\uFEFF${renderScript(env.publicAppUrl())}`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
