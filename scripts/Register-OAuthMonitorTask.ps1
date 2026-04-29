#Requires -Version 7.0
#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Registers (or re-registers) the CareerPilot OAuth token monitor as a
    Windows scheduled task under \CareerPilot\.
.DESCRIPTION
    Creates the task \CareerPilot\CareerPilot-OAuthMonitor which runs daily
    at 06:25 (five minutes before CareerPilot-JobSearch, so a STALE/DEAD
    alert lands before the next job-search run tries to use the dead
    token). The task invokes Run-OAuthMonitor.ps1 (sibling to this script).

    Pattern mirrors Register-JobSearchTask.ps1 (CAR-188 Unit 8) for
    consistency:
      * TaskPath '\CareerPilot\'
      * LogonType S4U (no password prompt, no foreground window)
      * RunLevel Limited (no admin elevation needed at runtime)
      * Args include -NonInteractive -WindowStyle Hidden
      * MultipleInstances IgnoreNew
      * ExecutionTimeLimit 5 minutes (monitor SLA is ~10s; 30x headroom)
.PARAMETER ScriptPath
    Path to Run-OAuthMonitor.ps1. Defaults to the sibling script in this
    directory.
.PARAMETER WorkingDirectory
    Working directory passed to the task action. Defaults to the parent of
    the script directory (the project root).
.PARAMETER At
    Daily trigger time. Defaults to '06:25'.
.EXAMPLE
    .\Register-OAuthMonitorTask.ps1
    Registers the task using the sibling Run-OAuthMonitor.ps1 and the
    derived project root.
.EXAMPLE
    .\Register-OAuthMonitorTask.ps1 -At '07:00' -WhatIf
    Previews the registration with a 07:00 trigger; makes no changes.
.NOTES
    Run from an elevated pwsh prompt. -Force makes registration idempotent
    (re-running overwrites the task definition rather than duplicating it).

    Verify after run:
      Get-ScheduledTask -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-OAuthMonitor'
      Start-ScheduledTask -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-OAuthMonitor'
      Get-ScheduledTaskInfo -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-OAuthMonitor'

    Ticket: CAR-196
#>

[CmdletBinding(SupportsShouldProcess)]
[OutputType([Microsoft.Management.Infrastructure.CimInstance])]
param(
    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Leaf })]
    [string]$ScriptPath = (Join-Path -Path $PSScriptRoot -ChildPath 'Run-OAuthMonitor.ps1'),

    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Container })]
    [string]$WorkingDirectory = (Split-Path -Parent $PSScriptRoot),

    [Parameter()]
    [ValidatePattern('^\d{2}:\d{2}$')]
    [string]$At = '06:25'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'

$TaskName = 'CareerPilot-OAuthMonitor'
$TaskPath = '\CareerPilot\'

if ($ScriptPath -match '\\\.worktrees\\') {
    Write-Warning ("ScriptPath is inside a git worktree: {0}" -f $ScriptPath)
    Write-Warning "After the PR merges, re-run this script from the post-merge checkout to repoint the task at the canonical path."
}

# --- Build the registration ---

$argString = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $ScriptPath

$action = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument $argString `
    -WorkingDirectory $WorkingDirectory

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$principal = New-ScheduledTaskPrincipal `
    -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType S4U `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

$registerArgs = @{
    TaskName    = $TaskName
    TaskPath    = $TaskPath
    Action      = $action
    Trigger     = $trigger
    Principal   = $principal
    Settings    = $settings
    Description = 'Daily OAuth token health monitor — mtime + live Gmail API ping, Discord alert on STALE/DEAD with 24h suppression [CAR-196]'
    Force       = $true
}

if ($PSCmdlet.ShouldProcess(("{0}{1}" -f $TaskPath, $TaskName), 'Register-ScheduledTask')) {
    $task = Register-ScheduledTask @registerArgs

    $today = Get-Date -Format 'yyyy-MM-dd'
    Write-Information ''
    Write-Information ("[OK] Task registered: {0}{1} (daily at {2})" -f $TaskPath, $TaskName, $At)
    Write-Information ''
    Write-Information 'Verify:'
    Write-Information ("  Get-ScheduledTask -TaskPath '{0}' -TaskName '{1}'"     -f $TaskPath, $TaskName)
    Write-Information ("  Start-ScheduledTask -TaskPath '{0}' -TaskName '{1}'"   -f $TaskPath, $TaskName)
    Write-Information ("  Get-ScheduledTaskInfo -TaskPath '{0}' -TaskName '{1}'" -f $TaskPath, $TaskName)
    Write-Information ''
    Write-Information "Inspect today's logs after a run:"
    Write-Information ("  Get-Content '{0}\logs\oauth-monitor-{1}.log' -Tail 30" -f $WorkingDirectory, $today)
    Write-Information ("  Get-Content '{0}\logs\oauth-monitor-{1}.json'"         -f $WorkingDirectory, $today)

    return $task
}
