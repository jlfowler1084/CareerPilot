# Run-MorningScan.ps1 — Wrapper for Windows Task Scheduler
# Ensures logging and clean execution environment
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Ensure logs directory exists
$LogDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$LogFile = Join-Path $LogDir "scan-$(Get-Date -Format 'yyyy-MM-dd').log"

# Run the scan, capture all output
& "$ScriptDir\Invoke-CPJobScan.ps1" *>&1 | Tee-Object -FilePath $LogFile -Append
