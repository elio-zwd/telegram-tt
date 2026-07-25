#Requires -Version 7.0

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSCommandPath
$webUrl = 'http://localhost:1234'
$startupTimeoutSeconds = 30

function Test-WebServerRunning {
  return Test-NetConnection -ComputerName 'localhost' -Port 1234 -InformationLevel Quiet -WarningAction SilentlyContinue
}

function Assert-ProjectDependencies {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    throw '未找到 node_modules，请先在项目根目录执行 npm install。'
  }

  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw '未找到 npm.cmd，请安装项目要求的 Node.js 与 npm。'
  }
}

Set-Location -LiteralPath $projectRoot
Assert-ProjectDependencies

if (-not (Test-WebServerRunning)) {
  Write-Host '正在启动网页版开发服务...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run dev' -WorkingDirectory $projectRoot

  $deadline = (Get-Date).AddSeconds($startupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-WebServerRunning) {
      break
    }

    Start-Sleep -Seconds 1
  }

  if (-not (Test-WebServerRunning)) {
    throw "网页版服务未能在 $startupTimeoutSeconds 秒内启动，请查看新打开的命令窗口。"
  }
}

Write-Host "正在打开 $webUrl"
Start-Process -FilePath $webUrl
