# Start-Dashboard.ps1 — Ensures the CareerPilot Next.js dev server is running
# Called by Windows Task Scheduler (CareerPilot-DashboardKeepAlive)
# Checks if port 3000 is in use; if not, starts the dev server.
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DashboardDir = Join-Path $ProjectRoot 'dashboard'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir "dashboard-$(Get-Date -Format 'yyyy-MM-dd').log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "$ts  $Message" | Tee-Object -FilePath $LogFile -Append
}

# Check if something is already listening on port 3000
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Log "Dashboard already running on port 3000 (PID $($portInUse.OwningProcess)). No action needed."
    exit 0
}

Write-Log "Port 3000 not in use. Starting dashboard dev server..."

# Verify dashboard directory and node_modules exist
if (-not (Test-Path (Join-Path $DashboardDir 'package.json'))) {
    Write-Log "ERROR: package.json not found in $DashboardDir"
    exit 1
}
if (-not (Test-Path (Join-Path $DashboardDir 'node_modules'))) {
    Write-Log "ERROR: node_modules not found. Run 'npm install' in $DashboardDir first."
    exit 1
}

# Start the dev server as a detached process
$npmPath = (Get-Command npm -ErrorAction SilentlyContinue).Source
if (-not $npmPath) {
    Write-Log "ERROR: npm not found in PATH"
    exit 1
}

# Start npm run dev in the dashboard directory, detached from this script
$proc = Start-Process -FilePath $npmPath `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $DashboardDir `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir "dashboard-stdout-$(Get-Date -Format 'yyyy-MM-dd').log") `
    -RedirectStandardError  (Join-Path $LogDir "dashboard-stderr-$(Get-Date -Format 'yyyy-MM-dd').log")

# Wait a few seconds and verify it started
Start-Sleep -Seconds 5

$portCheck = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portCheck) {
    Write-Log "Dashboard started successfully (PID $($proc.Id))."
} else {
    Write-Log "WARNING: Dashboard process started (PID $($proc.Id)) but port 3000 not yet listening. May still be initializing."
}
