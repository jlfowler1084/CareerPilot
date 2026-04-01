#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Registers the CareerPilot morning pipeline as Windows Task Scheduler tasks.
    Task 1: CareerPilot-MorningScan — runs at 7:00 AM daily
    Task 2: CareerPilot-SBAutoQueue — runs at 7:30 AM daily
.NOTES
    Run this script once with elevated privileges to set up the scheduled tasks.
    After registration, verify with: Get-ScheduledTask -TaskName 'CareerPilot-*'
#>

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# ============================================================
# Task 1: CareerPilot-MorningScan — 7:00 AM
# Runs all 8 search profiles against Dice and Indeed MCPs
# ============================================================
$Action1 = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"F:\Projects\CareerPilot\scripts\Run-MorningScan.ps1`"" `
    -WorkingDirectory 'F:\Projects\CareerPilot'

$Trigger1 = New-ScheduledTaskTrigger -Daily -At '7:00AM'

Register-ScheduledTask `
    -TaskName 'CareerPilot-MorningScan' `
    -Action $Action1 `
    -Trigger $Trigger1 `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'Daily 7AM job scan for CareerPilot — runs all search profiles against Dice and Indeed' `
    -Force

Write-Host "`n✅ Task 1 registered: CareerPilot-MorningScan (daily at 7:00 AM)"

# ============================================================
# Task 2: CareerPilot-SBAutoQueue — 7:30 AM
# SecondBrain scores scan results + email suggestions and
# queues best matches using career context from the vault.
#
# CRITICAL: -IncludeSuggestions flag is required. Without it,
# only scan_results from the 7:00 AM scan are processed.
# With it, the 23+ jobs from the email suggestions feed
# (Glassdoor, LinkedIn, Indeed alerts in the Suggestions tab)
# are ALSO scored and queued. These are often higher quality
# matches because they come from job board recommendation
# engines that already factor in profile data.
# ============================================================
$Action2 = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"Import-Module 'F:\Obsidian\SecondBrain\Resources\SB-PSModules\SecondBrain.psd1'; Invoke-SBAutoQueue -IncludeSuggestions`"" `
    -WorkingDirectory 'F:\Obsidian\SecondBrain'

$Trigger2 = New-ScheduledTaskTrigger -Daily -At '7:30AM'

Register-ScheduledTask `
    -TaskName 'CareerPilot-SBAutoQueue' `
    -Action $Action2 `
    -Trigger $Trigger2 `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'Daily 7:30AM SecondBrain auto-queue — scores scan results + email suggestions and queues best matches' `
    -Force

Write-Host "✅ Task 2 registered: CareerPilot-SBAutoQueue (daily at 7:30 AM)"
Write-Host ''
Write-Host 'Morning pipeline:'
Write-Host '  7:00 AM — CareerPilot-MorningScan: Dice/Indeed search → score → dedup → store'
Write-Host '  7:30 AM — CareerPilot-SBAutoQueue: SecondBrain scores scan_results + email suggestions → queues best matches'
Write-Host '  8:00 AM — Open dashboard: fresh results, scored, queued, ready for review'
Write-Host ''
# ============================================================
# Task 3: CareerPilot-DashboardKeepAlive — every 15 minutes
# Checks if the Next.js dev server is running on port 3000;
# if not, starts it automatically.
# ============================================================
$Action3 = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"F:\Projects\CareerPilot\scripts\Start-Dashboard.ps1`"" `
    -WorkingDirectory 'F:\Projects\CareerPilot'

# Trigger: every 15 minutes, indefinitely
$Trigger3 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
    -TaskName 'CareerPilot-DashboardKeepAlive' `
    -Action $Action3 `
    -Trigger $Trigger3 `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'Every 15 min: checks port 3000, starts Next.js dev server if not running' `
    -Force

Write-Host "`n✅ Task 3 registered: CareerPilot-DashboardKeepAlive (every 15 minutes)"

Write-Host ''
Write-Host 'Full pipeline:'
Write-Host '  Every 15 min — CareerPilot-DashboardKeepAlive: ensures dashboard dev server is running'
Write-Host '  7:00 AM      — CareerPilot-MorningScan: Dice/Indeed search → score → dedup → store'
Write-Host '  7:30 AM      — CareerPilot-SBAutoQueue: SecondBrain scores scan_results + email suggestions → queues best matches'
Write-Host '  8:00 AM      — Open dashboard: fresh results, scored, queued, ready for review'
Write-Host ''
Write-Host 'Verify:'
Write-Host '  Get-ScheduledTask -TaskName CareerPilot-MorningScan'
Write-Host '  Get-ScheduledTask -TaskName CareerPilot-SBAutoQueue'
Write-Host '  Get-ScheduledTask -TaskName CareerPilot-DashboardKeepAlive'
