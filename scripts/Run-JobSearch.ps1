<#
.SYNOPSIS
    Scheduled task wrapper for the CareerPilot CLI job search engine.
.DESCRIPTION
    Runs `python -m cli search run-profiles` with structured logging.
    Designed to be invoked by Windows Task Scheduler. The CLI engine
    reads search_profiles from Supabase, scrapes Dice (via MCP) plus
    Indeed (via Firecrawl), enriches each row, upserts into
    job_search_results, and posts a Discord daily summary.
.NOTES
    Scheduled Task: CareerPilot-JobSearch
    Default Trigger: 6:30 AM daily (30 minutes before MorningScan)
    CAR-188 Unit 8
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LogDir      = Join-Path $ProjectRoot 'logs'
$LogFile     = Join-Path $LogDir ("job-search-" + (Get-Date -Format 'yyyy-MM-dd') + ".log")

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

try {
    Set-Location -Path $ProjectRoot
    "[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] Starting CareerPilot-JobSearch" |
        Tee-Object -FilePath $LogFile -Append
    & python -m cli search run-profiles *>&1 | Tee-Object -FilePath $LogFile -Append
    $exitCode = $LASTEXITCODE
    "[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] Completed with exit code $exitCode" |
        Tee-Object -FilePath $LogFile -Append
    exit $exitCode
} catch {
    $errMsg = "[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] FATAL: " + $_.Exception.Message
    $errMsg | Out-File -FilePath $LogFile -Append -Encoding utf8
    exit 1
}
