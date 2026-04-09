#Requires -Version 5.1

<#
.SYNOPSIS
    Registers the CareerPilot-DevServerAutoStart scheduled task.
.DESCRIPTION
    Unregisters the old CareerPilot-DashboardKeepAlive task (if present) and
    registers a new task under \CareerPilot\ with correct principal (S4U),
    structured logging, and proper settings.

    Requires elevation (Run as Administrator) for:
    - Registering Event Log sources
    - Creating scheduled tasks with S4U principal
.EXAMPLE
    .\Register-DevServerAutoStart.ps1
    Registers the task with default settings.
.EXAMPLE
    .\Register-DevServerAutoStart.ps1 -Verbose
    Registers the task with verbose output showing each step.
.NOTES
    INFRA-100
    Author: ClaudeInfra
    Created: 2026-04-04
.LINK
    https://github.com/jlfowler1084/ClaudeInfra
#>

[CmdletBinding(SupportsShouldProcess)]
[OutputType([void])]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Elevation check ---

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning 'Not running as Administrator. Re-launching elevated...'
    $psExe = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
    if (-not $psExe) { $psExe = 'powershell.exe' }
    $elevateParams = @{
        FilePath     = $psExe
        ArgumentList = '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $MyInvocation.MyCommand.Path
        Verb         = 'RunAs'
        Wait         = $true
    }
    Start-Process @elevateParams
    exit 0
}

# --- Configuration ---

$TaskName = 'CareerPilot-DevServerAutoStart'
$TaskPath = '\CareerPilot\'
$OldTaskName = 'CareerPilot-DashboardKeepAlive'
$EventSource = 'CareerPilot-DevServer'
$ProjectRoot = 'F:\Projects\CareerPilot'
$ScriptPath = Join-Path $ProjectRoot 'tools' 'scheduled' 'Start-DevServer.ps1'
$LogDir = Join-Path $ProjectRoot 'logs' 'devserver'
$Description = 'Checks if CareerPilot Next.js dev server is running on port 3000 and starts it if not. Logs to Event Log (CareerPilot-DevServer) and JSON (F:\Projects\CareerPilot\logs\devserver\). [INFRA-100]'

# --- Pre-flight checks ---

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Script not found: $ScriptPath"
    exit 1
}

# --- Create directories ---

if (-not (Test-Path $LogDir)) {
    if ($PSCmdlet.ShouldProcess($LogDir, 'Create log directory')) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        Write-Verbose "Created log directory: $LogDir"
    }
}

# --- Register Event Log source ---

try {
    if ($PSCmdlet.ShouldProcess($EventSource, 'Register Event Log source')) {
        $sourceData = [System.Diagnostics.EventSourceCreationData]::new($EventSource, 'Application')
        [System.Diagnostics.EventLog]::CreateEventSource($sourceData)
        Write-Verbose "Registered Event Log source: $EventSource"
    }
}
catch [System.InvalidOperationException] {
    # Source already exists
    Write-Verbose "Event Log source already registered: $EventSource"
}
catch {
    Write-Warning "Could not register Event Log source: $_"
    Write-Warning "Event Log writes may fail. Run this script as Administrator."
}

# --- Unregister old tasks ---

$oldTaskLocations = @(
    @{ TaskName = $OldTaskName; TaskPath = '\' },
    @{ TaskName = $OldTaskName; TaskPath = $TaskPath },
    @{ TaskName = $TaskName;    TaskPath = $TaskPath }
)

foreach ($loc in $oldTaskLocations) {
    $existingTask = Get-ScheduledTask -TaskName $loc.TaskName -TaskPath $loc.TaskPath -ErrorAction SilentlyContinue
    if ($existingTask) {
        if ($PSCmdlet.ShouldProcess("$($loc.TaskPath)$($loc.TaskName)", 'Unregister scheduled task')) {
            $unregParams = @{
                TaskName = $loc.TaskName
                TaskPath = $loc.TaskPath
                Confirm  = $false
            }
            Unregister-ScheduledTask @unregParams
            Write-Verbose "Unregistered old task: $($loc.TaskPath)$($loc.TaskName)"
        }
    }
}

# --- Determine PowerShell executable ---

$pwshPath = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $pwshPath) {
    $pwshPath = (Get-Command powershell.exe -ErrorAction Stop).Source
    Write-Warning "pwsh.exe not found; falling back to powershell.exe: $pwshPath"
}
Write-Verbose "Using PowerShell executable: $pwshPath"

# --- Build task components ---

$actionArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$ScriptPath`""
$actionParams = @{
    Execute          = $pwshPath
    Argument         = $actionArgs
    WorkingDirectory = $ProjectRoot
}
$action = New-ScheduledTaskAction @actionParams

$triggerParams = @{
    Once               = $true
    At                 = (Get-Date).Date
    RepetitionInterval = (New-TimeSpan -Minutes 15)
}
$trigger = New-ScheduledTaskTrigger @triggerParams

$principalParams = @{
    UserId   = "$env:USERDOMAIN\$env:USERNAME"
    LogonType = 'S4U'
    RunLevel  = 'Highest'
}
$principal = New-ScheduledTaskPrincipal @principalParams

$settingsParams = @{
    AllowStartIfOnBatteries    = $true
    DontStopIfGoingOnBatteries = $true
    StartWhenAvailable         = $true
    ExecutionTimeLimit         = (New-TimeSpan -Minutes 5)
    MultipleInstances          = 'IgnoreNew'
}
$settings = New-ScheduledTaskSettingsSet @settingsParams

# --- Register the task ---

if ($PSCmdlet.ShouldProcess("$TaskPath$TaskName", 'Register scheduled task')) {
    $registerParams = @{
        TaskName    = $TaskName
        TaskPath    = $TaskPath
        Action      = $action
        Trigger     = $trigger
        Principal   = $principal
        Settings    = $settings
        Description = $Description
    }
    Register-ScheduledTask @registerParams | Out-Null
    Write-Verbose "Registered task: $TaskPath$TaskName"
}

# --- Verify registration ---

Write-Output ''
Write-Output '=== Task Registration Verification ==='

$task = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
$taskInfo = $task | Get-ScheduledTaskInfo

Write-Output "TaskName:    $($task.TaskName)"
Write-Output "TaskPath:    $($task.TaskPath)"
Write-Output "State:       $($task.State)"
Write-Output "Description: $($task.Description)"
Write-Output ''

$logonType = $task.Principal.LogonType
$runLevel = $task.Principal.RunLevel
Write-Output "Principal LogonType: $logonType"
Write-Output "Principal RunLevel:  $runLevel"
Write-Output ''

$actionExe = $task.Actions[0].Execute
$actionArg = $task.Actions[0].Arguments
Write-Output "Action Execute:   $actionExe"
Write-Output "Action Arguments: $actionArg"
Write-Output ''

$nextRun = $taskInfo.NextRunTime
Write-Output "Next Run: $nextRun"
Write-Output ''

# --- Confirm old task is gone ---

$oldTaskCheck = Get-ScheduledTask -TaskName $OldTaskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($oldTaskCheck) {
    Write-Warning "Old task still exists at root: \$OldTaskName"
}
else {
    Write-Output "[OK] Old task '$OldTaskName' at root '\' has been removed."
}

Write-Output ''
Write-Output '[OK] Registration complete.'
