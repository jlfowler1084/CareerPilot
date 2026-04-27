#Requires -Version 7.0
#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Registers (or re-registers) the CareerPilot CLI job search engine as a
    Windows scheduled task under \CareerPilot\.
.DESCRIPTION
    Creates the task \CareerPilot\CareerPilot-JobSearch which runs daily at
    06:30 (30 minutes before the existing CareerPilot-MorningScan). The task
    invokes Run-JobSearch.ps1 (sibling to this script).

    Configuration follows the powershell-windows skill conventions:
      * TaskPath '\CareerPilot\' (matches existing folder convention)
      * LogonType S4U (no password prompt, no foreground window, runs even
        when user is not logged on)
      * RunLevel Limited (no admin elevation needed at task runtime)
      * Args include -NonInteractive -WindowStyle Hidden so no console flash
      * MultipleInstances IgnoreNew (a stuck run won't queue duplicates)
      * ExecutionTimeLimit 30 minutes (CLI engine SLA is ~5 min; 6x headroom)

    The script also unregisters any existing CareerPilot-JobSearch task at
    the root TaskPath (artifact of a prior buggy registration) so that the
    folder convention is enforced.
.PARAMETER ScriptPath
    Path to Run-JobSearch.ps1. Defaults to the sibling script in this
    directory. Override only when registering for a path different from
    where this script currently lives.
.PARAMETER WorkingDirectory
    Working directory passed to the task action. Defaults to the parent of
    the script directory (the project root).
.PARAMETER At
    Daily trigger time. Defaults to '06:30'.
.EXAMPLE
    .\Register-JobSearchTask.ps1
    Registers the task using the sibling Run-JobSearch.ps1 and the
    derived project root.
.EXAMPLE
    .\Register-JobSearchTask.ps1 -At '07:00' -WhatIf
    Previews the registration with a 07:00 trigger; makes no changes.
.NOTES
    Run from an elevated pwsh prompt. -Force makes registration idempotent
    (re-running overwrites the task definition rather than duplicating it).

    Verify after run:
      Get-ScheduledTask -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-JobSearch'
      Start-ScheduledTask -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-JobSearch'
      Get-ScheduledTaskInfo -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-JobSearch'

    Ticket: CAR-188 Unit 8
#>

[CmdletBinding(SupportsShouldProcess)]
[OutputType([Microsoft.Management.Infrastructure.CimInstance])]
param(
    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Leaf })]
    [string]$ScriptPath = (Join-Path -Path $PSScriptRoot -ChildPath 'Run-JobSearch.ps1'),

    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Container })]
    [string]$WorkingDirectory = (Split-Path -Parent $PSScriptRoot),

    [Parameter()]
    [ValidatePattern('^\d{2}:\d{2}$')]
    [string]$At = '06:30'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'

$TaskName = 'CareerPilot-JobSearch'
$TaskPath = '\CareerPilot\'

# Warn if the resolved ScriptPath lives in a worktree -- the registered task
# will break if the worktree is later cleaned up. Acceptable for smoke
# testing before merge; flag it loudly.
if ($ScriptPath -match '\\\.worktrees\\') {
    Write-Warning ("ScriptPath is inside a git worktree: {0}" -f $ScriptPath)
    Write-Warning "After the PR merges, re-run this script from the post-merge checkout to repoint the task at the canonical path."
}

# Clean up any prior buggy registration at the root TaskPath. This is what
# the first version of this script produced; the new convention is the
# \CareerPilot\ folder.
$rootTask = Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($rootTask) {
    if ($PSCmdlet.ShouldProcess("\$TaskName", 'Unregister legacy root-path task')) {
        Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false
        Write-Verbose ("[OK] Unregistered legacy task at \{0}" -f $TaskName)
    }
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
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew

$registerArgs = @{
    TaskName    = $TaskName
    TaskPath    = $TaskPath
    Action      = $action
    Trigger     = $trigger
    Principal   = $principal
    Settings    = $settings
    Description = 'Daily 06:30 CLI job search -- Dice MCP + Indeed Firecrawl, eager Qwen enrichment, Supabase upsert, Discord summary [CAR-188]'
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
    Write-Information ("  Get-Content '{0}\logs\job-search-{1}.log' -Tail 30"  -f $WorkingDirectory, $today)
    Write-Information ("  Get-Content '{0}\logs\job-search-{1}.json'"           -f $WorkingDirectory, $today)

    return $task
}
