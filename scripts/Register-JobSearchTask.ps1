#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Registers the CareerPilot CLI job search engine as a Windows scheduled task.
.DESCRIPTION
    Task Name: CareerPilot-JobSearch
    Trigger:   Daily at 6:30 AM (30 minutes before CareerPilot-MorningScan)

    The engine reads search_profiles from Supabase, scrapes Dice + Indeed,
    enriches each result with a local Qwen extraction, upserts into
    job_search_results, and posts a Discord daily summary.
.NOTES
    Run once with elevated privileges. -Force makes registration idempotent;
    re-running this script overwrites the existing task definition rather
    than duplicating it.

    Verify after run:
      Get-ScheduledTask -TaskName CareerPilot-JobSearch
      Start-ScheduledTask -TaskName CareerPilot-JobSearch  # manual trigger
      Get-ScheduledTaskInfo -TaskName CareerPilot-JobSearch  # last result code

    CAR-188 Unit 8
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

$Action = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"F:\Projects\CareerPilot\scripts\Run-JobSearch.ps1`"" `
    -WorkingDirectory 'F:\Projects\CareerPilot'

$Trigger = New-ScheduledTaskTrigger -Daily -At '6:30AM'

Register-ScheduledTask `
    -TaskName 'CareerPilot-JobSearch' `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'Daily 6:30 AM CLI job search — Dice MCP + Indeed Firecrawl, eager Qwen enrichment, Supabase upsert, Discord summary' `
    -Force

Write-Host "`n✅ Task registered: CareerPilot-JobSearch (daily at 6:30 AM)"
Write-Host ''
Write-Host 'Verify:'
Write-Host '  Get-ScheduledTask -TaskName CareerPilot-JobSearch'
Write-Host '  Start-ScheduledTask -TaskName CareerPilot-JobSearch  # manual trigger'
Write-Host '  Get-ScheduledTaskInfo -TaskName CareerPilot-JobSearch  # last result code'
