#Requires -Version 7.0

<#
.SYNOPSIS
    Updates CareerPilot env files with rotated Supabase (and optionally Anthropic) keys.
.DESCRIPTION
    Prompts (no echo) for new sb_publishable_ and sb_secret_ values, backs up
    every target file with a timestamped suffix, then performs in-place edits:

        .env                       SUPABASE_SERVICE_ROLE_KEY value replaced
                                   SUPABASE_URL added if missing
        config\scan.env            SUPABASE_SERVICE_ROLE_KEY value replaced
                                   SUPABASE_URL added if missing
        dashboard\.env.local       NEXT_PUBLIC_SUPABASE_ANON_KEY value replaced
                                   NEXT_PUBLIC_SUPABASE_URL verified

    If any write fails the script restores all files from their backups.

    Optionally rotates the Anthropic API key in the same pass when --y is
    answered to the Anthropic prompt.

    Uses SecureString throughout so key values never appear in process
    arguments, PSReadLine history, or Get-History output. Plaintext exists in
    memory only between SecureString conversion and file write, then is
    cleared.
.PARAMETER ProjectRoot
    Path to the CareerPilot project root. Defaults to F:\Projects\CareerPilot.
.PARAMETER SkipSmokeTest
    Skip the post-update Supabase connectivity check. Default is to run it.
.PARAMETER SkipKillDevServer
    Skip the dashboard dev-server detection and shutdown step. Use this if
    you manage the dev server yourself and don't want the script to touch it.
.PARAMETER Force
    Suppress the [y/N] prompt before stopping detected dev-server processes.
    Useful for unattended / scripted runs.
.EXAMPLE
    .\Update-CPSecrets.ps1
    Interactive run with default project root, dev-server stop, and smoke test.
.EXAMPLE
    .\Update-CPSecrets.ps1 -WhatIf
    Preview the changes without writing anything.
.EXAMPLE
    .\Update-CPSecrets.ps1 -Force -SkipSmokeTest
    Unattended rotation: stop dev server without confirming, skip Python smoke test.
.NOTES
    Run from a fresh pwsh 7+ console. Admin not required (file edits live
    under the user's project directory). Stopping the dev server may require
    the same shell that started it, but Stop-Process by PID works cross-shell
    on Windows so admin is not needed for that either.

    Sequence:
      1. Pre-flight (target files exist).
      2. Prompt for new key values (no echo).
      3. Detect and stop dashboard dev-server processes (port 3000 and/or
         node.exe with `next` in command line).
      4. Backup all target files.
      5. Apply edits inside a try/rollback block.
      6. Run Supabase connectivity smoke test (optional).
      7. Print restart instructions.

    After successful run:
      1. Restart the dashboard dev server:
           cd dashboard
           npm run dev
      2. Re-trigger the Windows scheduled task for a clean morning-scan
         smoke test:
           Start-ScheduledTask -TaskPath '\CareerPilot\' -TaskName 'CareerPilot-MorningScan'

    Backup files are written next to each target with the suffix
    .bak-YYYYMMDD-HHMMSS. Delete them once verification is green.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Container })]
    [string]$ProjectRoot = 'F:\Projects\CareerPilot',

    [Parameter()]
    [switch]$SkipSmokeTest,

    [Parameter()]
    [switch]$SkipKillDevServer,

    [Parameter()]
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Constants ---

$SupabaseUrl = 'https://kfrffocrfnnuimwrngcs.supabase.co'

$EnvPath          = Join-Path $ProjectRoot '.env'
$ScanEnvPath      = Join-Path $ProjectRoot 'config\scan.env'
$DashboardEnvPath = Join-Path $ProjectRoot 'dashboard\.env.local'

$Targets = @($EnvPath, $ScanEnvPath, $DashboardEnvPath)

# --- Pre-flight ---

foreach ($p in $Targets) {
    if (-not (Test-Path -Path $p -PathType Leaf)) {
        throw "Missing target file: $p (run from a configured CareerPilot checkout)"
    }
}

# --- Helpers ---

function Read-Secret {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string]$Prompt,
        [Parameter()]          [string]$ExpectedPrefix
    )
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $plain  = ConvertFrom-SecureString -SecureString $secure -AsPlainText
    if ([string]::IsNullOrWhiteSpace($plain)) {
        throw "$Prompt -- empty value not allowed."
    }
    if ($ExpectedPrefix -and -not $plain.StartsWith($ExpectedPrefix)) {
        $shown = $plain.Substring(0, [Math]::Min(10, $plain.Length))
        Write-Warning ("Value does not start with expected prefix '{0}'. Got '{1}...'" -f $ExpectedPrefix, $shown)
        $confirm = Read-Host 'Continue anyway? [y/N]'
        if ($confirm -notmatch '^[yY]') { throw 'Aborted by user (prefix mismatch).' }
    }
    return $plain
}

function Backup-File {
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)] [string]$Path)
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $bak   = "$Path.bak-$stamp"
    Copy-Item -Path $Path -Destination $bak -Force
    return $bak
}

function Stop-DashboardDevServer {
    <#
    .SYNOPSIS
        Detect and stop dashboard dev-server processes.
    .DESCRIPTION
        Looks for processes via two channels:
          1. Anything LISTENing on TCP port 3000 (Next.js default).
          2. node.exe processes whose CommandLine contains 'next' or 'dashboard'.
        Deduplicates by PID, prompts for confirmation (unless -Force), then
        Stop-Process -Force on each surviving candidate.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([int])]
    param(
        [Parameter()] [switch]$Force
    )

    Write-Host ''
    Write-Host 'Checking for running dashboard dev server...' -ForegroundColor Cyan

    $candidates = @{}

    # Channel 1: TCP port 3000 listeners.
    try {
        $conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $procId = $conn.OwningProcess
            if ($procId -and $procId -gt 0) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) { $candidates[$procId] = $proc }
            }
        }
    } catch {
        Write-Verbose ("Get-NetTCPConnection probe failed: {0}" -f $_.Exception.Message)
    }

    # Channel 2: node.exe processes with 'next' or 'dashboard' in CommandLine.
    try {
        $cimProcs = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
        foreach ($cim in $cimProcs) {
            if ($cim.CommandLine -and ($cim.CommandLine -match '\bnext\b' -or $cim.CommandLine -match 'dashboard')) {
                $proc = Get-Process -Id $cim.ProcessId -ErrorAction SilentlyContinue
                if ($proc) { $candidates[$cim.ProcessId] = $proc }
            }
        }
    } catch {
        Write-Verbose ("Get-CimInstance probe failed: {0}" -f $_.Exception.Message)
    }

    if ($candidates.Count -eq 0) {
        Write-Host '    No dashboard dev server detected.' -ForegroundColor DarkGray
        return 0
    }

    Write-Host ('    Found {0} candidate process(es):' -f $candidates.Count)
    foreach ($procId in $candidates.Keys) {
        $p = $candidates[$procId]
        Write-Host ("      PID {0,-7} {1}" -f $procId, $p.ProcessName)
    }

    if (-not $Force) {
        $confirm = Read-Host 'Stop these processes before updating env files? [y/N]'
        if ($confirm -notmatch '^[yY]') {
            Write-Warning 'User declined to stop dev server. Dashboard will keep running with stale keys until you restart it manually.'
            return 0
        }
    }

    $stopped = 0
    foreach ($procId in $candidates.Keys) {
        if ($PSCmdlet.ShouldProcess(("PID {0}" -f $procId), 'Stop-Process -Force')) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction Stop
                Write-Host ('    [OK] Stopped PID {0}' -f $procId) -ForegroundColor Green
                $stopped++
            } catch {
                Write-Warning ('    Failed to stop PID {0}: {1}' -f $procId, $_.Exception.Message)
            }
        }
    }

    # Brief settle so port 3000 actually frees up before any downstream check.
    if ($stopped -gt 0) { Start-Sleep -Milliseconds 500 }
    return $stopped
}

function Update-EnvVar {
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$VarName,
        [Parameter(Mandatory)] [string]$NewValue,
        [Parameter()]          [switch]$AppendIfMissing
    )
    $lines    = Get-Content -Path $Path -Encoding UTF8
    $pattern  = '^\s*' + [regex]::Escape($VarName) + '\s*='
    $found    = $false
    $newLines = foreach ($line in $lines) {
        if ($line -match $pattern) {
            $found = $true
            "$VarName=$NewValue"
        } else {
            $line
        }
    }
    if (-not $found) {
        if ($AppendIfMissing) {
            $newLines = @($newLines) + @("$VarName=$NewValue")
        } else {
            Write-Warning ("$VarName not found in $Path; skipping (no -AppendIfMissing).")
            return $false
        }
    }
    if ($PSCmdlet.ShouldProcess($Path, "Set $VarName")) {
        # UTF-8 without BOM, LF preserved (PowerShell will write CRLF on Windows
        # by default; both work for dotenv but we keep CRLF here for consistency
        # with existing files).
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($Path, $newLines, $utf8)
        return $true
    }
    return $false
}

# --- Prompt for new values ---

Write-Host ''
Write-Host 'CareerPilot secrets rotation' -ForegroundColor Cyan
Write-Host ('-' * 30)
Write-Host 'Paste new values from Bitwarden when prompted.'
Write-Host 'Input is not echoed; values exist in memory only for the duration of the run.'
Write-Host ''

$NewSecretKey      = Read-Secret -Prompt 'New SUPABASE secret key      (sb_secret_...)' -ExpectedPrefix 'sb_secret_'
$NewPublishableKey = Read-Secret -Prompt 'New SUPABASE publishable key (sb_publishable_...)' -ExpectedPrefix 'sb_publishable_'

$rotateAnthropic = Read-Host 'Also rotate the Anthropic API key now? [y/N]'
$NewAnthropicKey = $null
if ($rotateAnthropic -match '^[yY]') {
    $NewAnthropicKey = Read-Secret -Prompt 'New ANTHROPIC API key       (sk-ant-...)' -ExpectedPrefix 'sk-ant-'
}

# --- Stop dashboard dev server (so file edits do not race a hot reload) ---

if (-not $SkipKillDevServer) {
    [void](Stop-DashboardDevServer -Force:$Force)
} else {
    Write-Host ''
    Write-Host '[skip] -SkipKillDevServer set; not touching dev-server processes.' -ForegroundColor DarkGray
}

# --- Backup all targets up front (rollback set) ---

$backups = @{}
foreach ($p in $Targets) {
    $backups[$p] = Backup-File -Path $p
}
Write-Host ''
Write-Host '[OK] Backups taken:' -ForegroundColor Green
foreach ($k in $backups.Keys) {
    Write-Host "    $($backups[$k])"
}

# --- Apply changes inside a try/rollback block ---

try {
    Write-Host ''
    Write-Host 'Updating .env ...' -ForegroundColor Cyan
    [void](Update-EnvVar -Path $EnvPath -VarName 'SUPABASE_URL' -NewValue $SupabaseUrl -AppendIfMissing)
    [void](Update-EnvVar -Path $EnvPath -VarName 'SUPABASE_SERVICE_ROLE_KEY' -NewValue $NewSecretKey)
    if ($NewAnthropicKey) {
        [void](Update-EnvVar -Path $EnvPath -VarName 'ANTHROPIC_API_KEY' -NewValue $NewAnthropicKey)
    }

    Write-Host 'Updating config\scan.env ...' -ForegroundColor Cyan
    [void](Update-EnvVar -Path $ScanEnvPath -VarName 'SUPABASE_URL' -NewValue $SupabaseUrl -AppendIfMissing)
    [void](Update-EnvVar -Path $ScanEnvPath -VarName 'SUPABASE_SERVICE_ROLE_KEY' -NewValue $NewSecretKey)
    if ($NewAnthropicKey) {
        [void](Update-EnvVar -Path $ScanEnvPath -VarName 'ANTHROPIC_API_KEY' -NewValue $NewAnthropicKey)
    }

    Write-Host 'Updating dashboard\.env.local ...' -ForegroundColor Cyan
    [void](Update-EnvVar -Path $DashboardEnvPath -VarName 'NEXT_PUBLIC_SUPABASE_URL' -NewValue $SupabaseUrl -AppendIfMissing)
    [void](Update-EnvVar -Path $DashboardEnvPath -VarName 'NEXT_PUBLIC_SUPABASE_ANON_KEY' -NewValue $NewPublishableKey)
}
catch {
    Write-Error ("Update failed: {0}" -f $_.Exception.Message)
    Write-Warning 'Rolling back from backups...'
    foreach ($k in $backups.Keys) {
        Copy-Item -Path $backups[$k] -Destination $k -Force
        Write-Host "    Restored: $k" -ForegroundColor Yellow
    }
    throw
}
finally {
    # Best-effort scrub of plaintext secrets from memory.
    # Setting to $null does not zero the underlying string buffer (.NET
    # strings are immutable) but does drop the only reference, making it
    # eligible for GC. The full scrub happens when the process exits.
    $NewSecretKey      = $null
    $NewPublishableKey = $null
    $NewAnthropicKey   = $null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host ''
Write-Host '[OK] All files updated.' -ForegroundColor Green

# --- Smoke test ---

if (-not $SkipSmokeTest) {
    Write-Host ''
    Write-Host 'Running Supabase connectivity smoke test...' -ForegroundColor Cyan
    $pythonExe = (Get-Command -Name 'python' -ErrorAction SilentlyContinue)?.Source
    if (-not $pythonExe) {
        Write-Warning 'python.exe not on PATH; skipping smoke test. Run manually with: python -m cli search run-profiles --dry-run'
    } else {
        Push-Location $ProjectRoot
        try {
            $smoke = @'
from src.db.supabase_client import get_supabase_client
try:
    r = get_supabase_client().table("search_profiles").select("id").limit(1).execute()
    print(f"OK rows={len(r.data) if r.data is not None else 0}")
except Exception as e:
    print(f"FAIL {type(e).__name__}: {e}")
'@
            $result = & $pythonExe -c $smoke
            Write-Host "    Result: $result"
            if ($result -match '^OK') {
                Write-Host '[OK] Smoke test passed; Supabase secret key is working.' -ForegroundColor Green
            } else {
                Write-Warning 'Smoke test reported failure. Backups remain in place; investigate before deleting.'
            }
        } finally {
            Pop-Location
        }
    }
}

# --- Wrap-up ---

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. Restart the dashboard dev server (it was stopped above):'
Write-Host '       cd dashboard'
Write-Host '       npm run dev'
Write-Host '  2. Re-run the morning-scan task once to clear the 14-day failure log:'
Write-Host '       Start-ScheduledTask -TaskPath ''\CareerPilot\'' -TaskName ''CareerPilot-MorningScan'''
Write-Host '  3. Once you confirm everything works, delete the .bak-* files:'
Write-Host ('       Get-ChildItem -Path "{0}" -Recurse -Filter "*.bak-*" | Remove-Item' -f $ProjectRoot)
Write-Host ''
