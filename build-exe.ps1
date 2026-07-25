#Requires -Version 7.0

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSCommandPath
$bundleDirectory = Join-Path $projectRoot 'tauri\target\release\bundle'
$releaseDirectory = Join-Path $projectRoot 'tauri\target\release'

function Assert-ProjectDependencies {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    throw '未找到 node_modules，请先在项目根目录执行 npm install。'
  }

  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw '未找到 npm.cmd，请安装项目要求的 Node.js 与 npm。'
  }
}

function Invoke-NpmScript {
  param(
    [Parameter(Mandatory)]
    [string] $ScriptName
  )

  & npm.cmd run $ScriptName
  if ($LASTEXITCODE -ne 0) {
    throw "npm run $ScriptName 执行失败，退出码：$LASTEXITCODE"
  }
}

Set-Location -LiteralPath $projectRoot
Assert-ProjectDependencies

Write-Host '正在构建前端生产文件...'
Invoke-NpmScript -ScriptName 'build:production'

Write-Host '正在打包 Windows EXE...'
Invoke-NpmScript -ScriptName 'tauri:build'

$installer = if (Test-Path -LiteralPath $bundleDirectory) {
  Get-ChildItem -LiteralPath $bundleDirectory -Recurse -File -Filter '*.exe' |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -First 1
}

if ($installer) {
  Write-Host "构建完成，安装包位置：$($installer.FullName)"
  exit 0
}

$executable = Get-ChildItem -LiteralPath $releaseDirectory -File -Filter 'telegram_air.exe' -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($executable) {
  Write-Host "构建完成，运行程序位置：$($executable.FullName)"
  exit 0
}

throw 'Tauri 构建已结束，但未找到 EXE 文件。'
