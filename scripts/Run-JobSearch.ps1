#Requires -Version 7.0

<#
.SYNOPSIS
    Scheduled-task wrapper for the CareerPilot CLI job search engine.
.DESCRIPTION
    Runs `python -m cli search run-profiles` from the project root.
    Captures Python stdout/stderr to a daily human-readable log and emits
    structured JSON wrapper events (Start / Complete / Fatal) to a sibling
    .json file. Designed to be invoked by Windows Task Scheduler under an
    S4U principal (no foreground window, no password storage).

    The CLI engine reads search_profiles from Supabase, scrapes Dice (via
    MCP) plus Indeed (via Firecrawl), enriches each row with a local Qwen
    extraction, upserts into job_search_results, and posts a Discord daily
    summary.
.PARAMETER ProjectRoot
    Path to the CareerPilot project root. Defaults to the parent of the
    script directory so the wrapper works from both the main checkout and
    a git worktree.
.EXAMPLE
    .\Run-JobSearch.ps1
    Runs the engine against the default project root with default logging.
.EXAMPLE
    .\Run-JobSearch.ps1 -Verbose
    Runs with operational verbose output streamed to the host.
.NOTES
    Scheduled Task: \CareerPilot\CareerPilot-JobSearch
    Default Trigger: 06:30 daily
    Ticket: CAR-188 Unit 8
#>

[CmdletBinding()]
[OutputType([int])]
param(
    [Parameter()]
    [ValidateScript({ Test-Path -Path $_ -PathType Container })]
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Paths ---

$LogDir   = Join-Path -Path $ProjectRoot -ChildPath 'logs'
$DateStem = Get-Date -Format 'yyyy-MM-dd'
$LogFile  = Join-Path -Path $LogDir -ChildPath ("job-search-{0}.log"  -f $DateStem)
$JsonFile = Join-Path -Path $LogDir -ChildPath ("job-search-{0}.json" -f $DateStem)

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
Write-WrapperEvent -Level Info -Operation Start -Message 'CareerPilot-JobSearch wrapper started' -Data @{
    ProjectRoot = $ProjectRoot
    LogFile     = $LogFile
    JsonFile    = $JsonFile
}

try {
    Set-Location -Path $ProjectRoot

    # Resolve the Python launcher up-front so we get a clear failure if it's
    # missing from PATH in the scheduled-task runtime context.
    $pythonExe = (Get-Command -Name 'python' -ErrorAction SilentlyContinue)?.Source
    if (-not $pythonExe) {
        throw "python.exe not on PATH for user '$env:USERNAME'. Scheduled-task contexts often have a stripped PATH; resolve via 'py -3.12' or hardcode the launcher path."
    }

    "[{0}] Starting python -m cli search run-profiles ({1})" -f (Get-Date -Format 'o'), $pythonExe |
        Tee-Object -FilePath $LogFile -Append | Out-Null

    & $pythonExe -m cli search run-profiles *>&1 | Tee-Object -FilePath $LogFile -Append
    $exitCode = $LASTEXITCODE

    "[{0}] Python exited with code {1}" -f (Get-Date -Format 'o'), $exitCode |
        Tee-Object -FilePath $LogFile -Append | Out-Null

    $duration = (Get-Date) - $startTime
    $level    = if ($exitCode -eq 0) { 'Success' } else { 'Error' }
    Write-WrapperEvent -Level $level -Operation Complete -Message ("Engine exited with code {0}" -f $exitCode) -Data @{
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
