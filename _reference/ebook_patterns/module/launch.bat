@echo off
REM EbookAutomation — Quick-launch PowerShell with module loaded
REM Place this in the module\ folder or the project root.

cd /d "%~dp0.."
powershell.exe -NoExit -ExecutionPolicy Bypass -Command "Import-Module '%~dp0EbookAutomation.psm1' -Force; Write-Host '  EbookAutomation module loaded.' -ForegroundColor Green; Write-Host '  Type Get-Help Invoke-EbookPipeline for usage.' -ForegroundColor Cyan"
