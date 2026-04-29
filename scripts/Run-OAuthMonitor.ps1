#Requires -Version 7.0

<#
.SYNOPSIS
    Scheduled-task wrapper for the CareerPilot OAuth token monitor (CAR-196).
.DESCRIPTION
    Runs `python tools/check_oauth_token.py` from the project root. Captures
    stdout/stderr to a daily human-readable log and emits structured JSON
    wrapper events (Start / Complete / Fatal) to a sibling .json file.

    Designed to be invoked by Windows Task Scheduler under an S4U principal
    (no foreground window, no password storage). Exit codes pass through
    from the Python script:
      0 = token FRESH
      1 = STALE alert fired (or suppressed)
      2 = DEAD alert fired (or suppressed)

    Unlike Run-JobSearch.ps1, this wrapper deliberately skips `git pull` and
    `pip install`: the monitor's whole job is to detect a broken OAuth state,
    and a noisy preflight that fails on its own muddies the signal. The
    monitor logic is stable; if it ever needs a dep update, run it manually.
.PARAMETER ProjectRoot
    Path to the CareerPilot project root. Defaults to the parent of the
    script directory so this works from both the main checkout and a
    worktree.
.EXAMPLE
    .\Run-OAuthMonitor.ps1
    Runs the monitor against the default project root with default logging.
.EXAMPLE
    .\Run-OAuthMonitor.ps1 -DryRun
    Logs the alert message to the console without posting to Discord.
.NOTES
    Scheduled Task: \CareerPilot\CareerPilot-OAuthMonitor
    Default Trigger: 06:25 daily (five minutes before CareerPilot-JobSearch)
    Ticket: CAR-196
#>

[CmdletBinding()]
[OutputType([int])]
param(
    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Container })]
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter()]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Paths ---

$LogDir   = Join-Path -Path $ProjectRoot -ChildPath 'logs'
$DateStem = Get-Date -Format 'yyyy-MM-dd'
$LogFile  = Join-Path -Path $LogDir -ChildPath ("oauth-monitor-{0}.log"  -f $DateStem)
$JsonFile = Join-Path -Path $LogDir -ChildPath ("oauth-monitor-{0}.json" -f $DateStem)
$PythonScript = Join-Path -Path $ProjectRoot -ChildPath 'tools\check_oauth_token.py'

if (-not (Test-Path -Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# --- Functions ---

function Write-WrapperEvent {
    [CmdletBinding()]
    [OutputType([void])]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Info', 'Warning', 'Error', 'Success')]
        [string]$Level,

        [Parameter(Mandatory)]
        [ValidateSet('Start', 'Complete', 'Fatal')]
        [string]$Operation,

        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter()]
        [hashtable]$Data
    )

    $entry = [ordered]@{
        Timestamp = (Get-Date -Format 'o')
        Level     = $Level
        Operation = $Operation
        Message   = $Message
        Computer  = $env:COMPUTERNAME
        User      = $env:USERNAME
        PID       = $PID
    }
    if ($Data) { $entry['Data'] = $Data }

    $json = $entry | ConvertTo-Json -Depth 10 -Compress
    Add-Content -Path $script:JsonFile -Value $json -Encoding UTF8

    $tag = "[{0}] {1}" -f $Level.ToUpper(), $Message
    switch ($Level) {
        'Warning' { Write-Warning $Message }
        'Error'   { Write-Error  $Message -ErrorAction Continue }
        default   { Write-Verbose $tag }
    }
}

# --- Main ---

$startTime = Get-Date
Write-WrapperEvent -Level Info -Operation Start -Message 'CareerPilot-OAuthMonitor wrapper started' -Data @{
    ProjectRoot = $ProjectRoot
    LogFile     = $LogFile
    JsonFile    = $JsonFile
    DryRun      = [bool]$DryRun
}

try {
    Set-Location -Path $ProjectRoot

    if (-not (Test-Path -Path $PythonScript -PathType Leaf)) {
        throw "Monitor script not found at $PythonScript"
    }

    $pythonExe = (Get-Command -Name 'python' -ErrorAction SilentlyContinue)?.Source
    if (-not $pythonExe) {
        throw "python.exe not on PATH for user '$env:USERNAME'. Scheduled-task contexts often have a stripped PATH; resolve via 'py -3.12' or hardcode the launcher path."
    }

    "[{0}] Starting python tools/check_oauth_token.py ({1})" -f (Get-Date -Format 'o'), $pythonExe |
        Tee-Object -FilePath $LogFile -Append | Out-Null

    $pyArgs = @($PythonScript)
    if ($DryRun) { $pyArgs += '--dry-run' }

    & $pythonExe @pyArgs *>&1 | Tee-Object -FilePath $LogFile -Append
    $exitCode = $LASTEXITCODE

    "[{0}] Python exited with code {1}" -f (Get-Date -Format 'o'), $exitCode |
        Tee-Object -FilePath $LogFile -Append | Out-Null

    $duration = (Get-Date) - $startTime
    $level = switch ($exitCode) {
        0       { 'Success' }
        1       { 'Warning' }   # STALE
        2       { 'Warning' }   # DEAD — alerted, not a wrapper failure
        default { 'Error' }
    }
    Write-WrapperEvent -Level $level -Operation Complete -Message ("Monitor exited with code {0}" -f $exitCode) -Data @{
        ExitCode        = $exitCode
        DurationSeconds = [math]::Round($duration.TotalSeconds, 2)
        PythonPath      = $pythonExe
    }

    exit $exitCode
}
catch {
    $duration = (Get-Date) - $startTime
    Write-WrapperEvent -Level Error -Operation Fatal -Message $_.Exception.Message -Data @{
        DurationSeconds  = [math]::Round($duration.TotalSeconds, 2)
        ScriptStackTrace = $_.ScriptStackTrace
        ErrorId          = $_.FullyQualifiedErrorId
    }
    "[{0}] FATAL: {1}" -f (Get-Date -Format 'o'), $_.Exception.Message |
        Out-File -FilePath $LogFile -Append -Encoding utf8
    exit 1
}
