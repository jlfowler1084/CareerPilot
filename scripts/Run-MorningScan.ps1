<#
.SYNOPSIS
    Scheduled task wrapper for the CareerPilot morning job scan.
.DESCRIPTION
    Runs Invoke-CPJobScan.ps1 with structured logging and proper error handling.
    Designed to be invoked by Windows Task Scheduler (S4U, no interactive window).
.NOTES
    Scheduled Task: CareerPilot-MorningScan
    Task Folder:    \CareerPilot\
    INFRA-105
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LogDir      = Join-Path $ProjectRoot 'logs'
$LogFile     = Join-Path $LogDir ("scan-" + (Get-Date -Format 'yyyy-MM-dd') + ".log")

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

try {
    & "$ScriptDir\Invoke-CPJobScan.ps1" *>&1 | Tee-Object -FilePath $LogFile -Append
    exit 0
} catch {
    $errMsg = "[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] FATAL: " + $_.Exception.Message
    $errMsg | Out-File -FilePath $LogFile -Append -Encoding utf8
    exit 1
}
