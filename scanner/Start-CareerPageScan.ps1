<#
.SYNOPSIS
    Start-CareerPageScan.ps1 -- CareerPilot Direct Employer Scanner Launcher

.DESCRIPTION
    Securely prompts for your Anthropic API key (masked input), sets up the
    environment, and runs the full career page scanning pipeline.

    Components:
      1. career_page_scraper.py  -- Scans 10 Indy employer career pages
      2. morning_scan.py         -- Unified scan (Direct + Indeed + Dice)

.EXAMPLE
    .\Start-CareerPageScan.ps1                  # Full scan (all sources)
    .\Start-CareerPageScan.ps1 -Quick           # Direct employers only
    .\Start-CareerPageScan.ps1 -Company lilly   # Single company
    .\Start-CareerPageScan.ps1 -DirectOnly      # Skip Indeed/Dice
    .\Start-CareerPageScan.ps1 -SetupTask       # Register daily 7 AM task
    .\Start-CareerPageScan.ps1 -Export          # Export results as JSON

.NOTES
    Location: C:\Users\Joe\Downloads\Scrapers
    Project:  SCRUM-97 -- Direct company career page monitoring
#>

[CmdletBinding()]
param(
    [switch]$Quick,
    [switch]$DirectOnly,
    [switch]$Export,
    [switch]$ListJobs,
    [switch]$NewOnly,
    [switch]$Stats,
    [switch]$SetupTask,
    [switch]$SaveKey,
    [string]$Company,
    [string]$OutputPath
)

# ═══════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════

$ScriptRoot     = $PSScriptRoot
$ScraperScript  = Join-Path $ScriptRoot "career_page_scraper.py"
$MorningScan    = Join-Path $ScriptRoot "morning_scan.py"
$RegisterTask   = Join-Path $ScriptRoot "Register-MorningScan.ps1"
$DataDir        = Join-Path $ScriptRoot "data"
$ReportsDir     = Join-Path $DataDir "reports"
$KeyFile        = Join-Path $DataDir ".api_key.enc"

# ═══════════════════════════════════════════════════════════════
# Secure API Key Management
# ═══════════════════════════════════════════════════════════════

function Get-ApiKey {
    <#
    .SYNOPSIS
        Retrieves the Anthropic API key from (in order):
        1. Current environment variable
        2. Encrypted file on disk (Windows DPAPI -- tied to your user account)
        3. Secure prompt (masked input)
    #>

    # 1. Check environment
    if ($env:ANTHROPIC_API_KEY) {
        Write-Host "  [key] Using API key from environment variable" -ForegroundColor DarkGray
        return $env:ANTHROPIC_API_KEY
    }

    # 2. Check encrypted file
    if (Test-Path $KeyFile) {
        try {
            $encrypted = Get-Content $KeyFile -Raw
            $secure    = $encrypted | ConvertTo-SecureString
            $bstr      = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            $plain     = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

            if ($plain -and $plain.StartsWith("sk-ant-")) {
                Write-Host "  [key] Loaded API key from encrypted store" -ForegroundColor DarkGray
                return $plain
            }
        }
        catch {
            Write-Warning "Could not decrypt saved key. Will prompt for a new one."
            Remove-Item $KeyFile -Force -ErrorAction SilentlyContinue
        }
    }

    # 3. Prompt securely
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  Anthropic API Key Required                     ║" -ForegroundColor Cyan
    Write-Host "  ║  Input is masked -- your key will not be shown.  ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    $secureKey = Read-Host -Prompt "  Enter your Anthropic API key" -AsSecureString

    # Convert SecureString to plain text (in memory only)
    $bstr  = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    if (-not $plain -or $plain.Length -lt 10) {
        Write-Error "Invalid API key. Aborting."
        exit 1
    }

    # Offer to save (encrypted with Windows DPAPI -- only your user account can decrypt)
    Write-Host ""
    $save = Read-Host "  Save key encrypted for future runs? (y/n)"
    if ($save -eq 'y') {
        Save-ApiKey -PlainKey $plain
    }

    Write-Host "  [key] API key loaded (not displayed)" -ForegroundColor DarkGray
    return $plain
}

function Save-ApiKey {
    param([string]$PlainKey)

    if (-not (Test-Path $DataDir)) {
        New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    }

    # Encrypt with Windows DPAPI (CurrentUser scope -- only this user can decrypt)
    $secure    = ConvertTo-SecureString $PlainKey -AsPlainText -Force
    $encrypted = $secure | ConvertFrom-SecureString

    $encrypted | Set-Content -Path $KeyFile -Force

    # Set file permissions -- owner only
    $acl = Get-Acl $KeyFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
        "FullControl", "Allow"
    )
    $acl.AddAccessRule($rule)
    Set-Acl -Path $KeyFile -AclObject $acl -ErrorAction SilentlyContinue

    # Also hide the file
    (Get-Item $KeyFile).Attributes = 'Hidden'

    Write-Host "  [key] API key encrypted and saved to $KeyFile" -ForegroundColor Green
    Write-Host "  [key] Encrypted with Windows DPAPI (your user account only)" -ForegroundColor DarkGray
}

function Remove-SavedKey {
    if (Test-Path $KeyFile) {
        Remove-Item $KeyFile -Force
        Write-Host "  Saved API key removed." -ForegroundColor Yellow
    } else {
        Write-Host "  No saved key found." -ForegroundColor DarkGray
    }
}

# ═══════════════════════════════════════════════════════════════
# Prerequisites Check
# ═══════════════════════════════════════════════════════════════

function Test-Prerequisites {
    Write-Host ""
    Write-Host "  Checking prerequisites..." -ForegroundColor DarkGray

    # Python
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        $python = Get-Command python3 -ErrorAction SilentlyContinue
    }
    if (-not $python) {
        Write-Error "Python not found. Install Python 3.8+ and ensure it's on PATH."
        exit 1
    }
    $pyVersion = & $python.Source --version 2>&1
    Write-Host "  [ok] $pyVersion" -ForegroundColor Green

    # Required Python packages
    $packages = @("requests")
    foreach ($pkg in $packages) {
        $check = & $python.Source -c "import $pkg" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [install] Installing $pkg..." -ForegroundColor Yellow
            & $python.Source -m pip install $pkg --break-system-packages -q 2>&1 | Out-Null
        }
    }
    Write-Host "  [ok] Python packages ready" -ForegroundColor Green

    # Script files
    $requiredFiles = @($ScraperScript, $MorningScan)
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            Write-Error "Missing required file: $file"
            exit 1
        }
    }
    Write-Host "  [ok] Script files present" -ForegroundColor Green

    # Data directory
    if (-not (Test-Path $DataDir))    { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
    if (-not (Test-Path $ReportsDir)) { New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null }
    Write-Host "  [ok] Data directories ready" -ForegroundColor Green

    return $python.Source
}

# ═══════════════════════════════════════════════════════════════
# Banner
# ═══════════════════════════════════════════════════════════════

function Show-Banner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════════════════════╗" -ForegroundColor DarkCyan
    Write-Host "  ║                                                           ║" -ForegroundColor DarkCyan
    Write-Host "  ║   CareerPilot -- Direct Employer Career Page Scanner       ║" -ForegroundColor Cyan
    Write-Host "  ║   SCRUM-97 · Indeed + Dice + 10 Indy Employers           ║" -ForegroundColor DarkCyan
    Write-Host "  ║                                                           ║" -ForegroundColor DarkCyan
    Write-Host "  ╚═══════════════════════════════════════════════════════════╝" -ForegroundColor DarkCyan
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════
# Main Execution
# ═══════════════════════════════════════════════════════════════

Show-Banner

# Handle -SaveKey standalone
if ($SaveKey) {
    $key = Get-ApiKey
    if (-not (Test-Path $KeyFile)) {
        Save-ApiKey -PlainKey $key
    }
    return
}

# Handle -SetupTask
if ($SetupTask) {
    if (Test-Path $RegisterTask) {
        & $RegisterTask
    } else {
        Write-Error "Register-MorningScan.ps1 not found at $RegisterTask"
    }
    return
}

# Run prerequisites
$PythonExe = Test-Prerequisites

# Get API key securely
$ApiKey = Get-ApiKey

# Set environment variable for child processes (in-memory only, not persisted)
$env:ANTHROPIC_API_KEY = $ApiKey

# Clear the plain text variable
$ApiKey = $null
[System.GC]::Collect()

Write-Host ""
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
Write-Host "  Scan started: $timestamp" -ForegroundColor White
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── Route to the requested command ──

if ($ListJobs) {
    & $PythonExe $ScraperScript list
}
elseif ($NewOnly) {
    & $PythonExe $ScraperScript new
}
elseif ($Stats) {
    & $PythonExe $ScraperScript stats
}
elseif ($Export) {
    $outFile = if ($OutputPath) { $OutputPath } else { Join-Path $ReportsDir "export_$(Get-Date -Format 'yyyy-MM-dd').json" }
    & $PythonExe $ScraperScript export --output $outFile
    Write-Host ""
    Write-Host "  Exported to: $outFile" -ForegroundColor Green
}
elseif ($DirectOnly) {
    # Direct employers only via career_page_scraper.py
    if ($Company) {
        Write-Host "  Mode: Single company ($Company)" -ForegroundColor Cyan
        & $PythonExe $ScraperScript scan --company $Company
    } else {
        Write-Host "  Mode: All direct employers" -ForegroundColor Cyan
        & $PythonExe $ScraperScript scan
    }
}
elseif ($Quick) {
    # Morning scan, direct only (skip boards)
    Write-Host "  Mode: Quick scan (direct employers only)" -ForegroundColor Cyan
    $reportFile = Join-Path $ReportsDir "quick_$(Get-Date -Format 'yyyy-MM-dd_HHmm')"
    & $PythonExe $MorningScan --quick --output $reportFile
}
else {
    # Full morning scan -- all sources
    Write-Host "  Mode: Full scan (Direct + Indeed + Dice)" -ForegroundColor Cyan
    $reportFile = Join-Path $ReportsDir "morning_$(Get-Date -Format 'yyyy-MM-dd_HHmm')"
    if ($Company) {
        & $PythonExe $MorningScan --company $Company --output $reportFile
    } else {
        & $PythonExe $MorningScan --output $reportFile
    }
}

# Clean up environment
$env:ANTHROPIC_API_KEY = $null

Write-Host ""
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Scan complete: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
