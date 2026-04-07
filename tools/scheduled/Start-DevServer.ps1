#Requires -Version 5.1

<#
.SYNOPSIS
    Checks if the CareerPilot Next.js dev server is running and starts it if not.
.DESCRIPTION
    Scheduled task that monitors port 3000. If the dev server is not detected,
    starts it via npm run dev as a background process that persists after the
    script exits. Logs all activity to Windows Event Log and JSON log files.
.NOTES
    Scheduled Task: CareerPilot-DevServerAutoStart
    Task Folder:    \CareerPilot\
    Event Log Source: CareerPilot-DevServer
    INFRA-100
    Author: ClaudeInfra
    Created: 2026-04-04
.LINK
    https://github.com/jlfowler1084/ClaudeInfra
#>

[CmdletBinding()]
[OutputType([void])]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Configuration ---

$Port = 3000
$EventSource = 'CareerPilot-DevServer'
$ProjectRoot = 'F:\Projects\CareerPilot'
$DashboardDir = Join-Path $ProjectRoot 'dashboard'
$LogDir = Join-Path $ProjectRoot 'logs' 'devserver'
$today = Get-Date -Format 'yyyy-MM-dd'
$LogFile = Join-Path $LogDir "devserver-$today.log"
$StartupWaitSeconds = 20

# --- Ensure log directory exists ---

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# --- Functions ---

function Initialize-EventLogSource {
    [CmdletBinding()]
    [OutputType([void])]
    param()

    try {
        # SourceExists scans all logs including Security, which fails without admin.
        # Use CreateEventSource directly — it will no-op if the source already exists
        # in the target log, or throw if it exists elsewhere.
        $sourceData = [System.Diagnostics.EventSourceCreationData]::new($script:EventSource, 'Application')
        [System.Diagnostics.EventLog]::CreateEventSource($sourceData)
        Write-Verbose "Registered Event Log source: $script:EventSource"
    }
    catch [System.InvalidOperationException] {
        # Source already exists — this is fine
        Write-Verbose "Event Log source already registered: $script:EventSource"
    }
    catch {
        # Non-admin sessions cannot register sources; warn but continue
        Write-Warning "Could not register Event Log source '$script:EventSource': $_"
    }
}

function Write-KeepAliveLog {
    [CmdletBinding()]
    [OutputType([void])]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('AlreadyRunning', 'Started', 'StartedPendingVerify', 'Failed')]
        [string]$Status,

        [Parameter()]
        [int]$Port,

        [Parameter()]
        [int]$ProcessId,

        [Parameter()]
        [string]$ErrorMessage
    )

    # --- JSON log entry ---
    $entry = [ordered]@{
        timestamp    = (Get-Date -Format 'o')
        status       = $Status
        port         = $Port
        pid          = $ProcessId
        errorMessage = $ErrorMessage
    }
    $json = $entry | ConvertTo-Json -Depth 10 -Compress
    Add-Content -Path $script:LogFile -Value $json -Encoding UTF8

    # --- Event Log entry ---
    $eventParams = @{
        LogName = 'Application'
        Source  = $script:EventSource
    }

    switch ($Status) {
        'AlreadyRunning' {
            $eventParams['EntryType'] = 'Information'
            $eventParams['EventId'] = 1000
            $eventParams['Message'] = "Dev server already running on port $Port."
            Write-Verbose "[OK] Server already running on port $Port"
        }
        'Started' {
            $eventParams['EntryType'] = 'Information'
            $eventParams['EventId'] = 1001
            $startedPid = $ProcessId
            $eventParams['Message'] = "Dev server started successfully (PID $startedPid) on port $Port."
            Write-Verbose "[OK] Server started (PID $startedPid) on port $Port"
        }
        'StartedPendingVerify' {
            $eventParams['EntryType'] = 'Warning'
            $eventParams['EventId'] = 2000
            $pendingPid = $ProcessId
            $eventParams['Message'] = "Dev server process started (PID $pendingPid) but port $Port not yet responding after $($script:StartupWaitSeconds)s. May still be initializing."
            Write-Warning "Server started (PID $pendingPid) but port $Port not yet responding after $($script:StartupWaitSeconds)s"
        }
        'Failed' {
            $eventParams['EntryType'] = 'Error'
            $eventParams['EventId'] = 3000
            $eventParams['Message'] = "Failed to start dev server: $ErrorMessage"
            Write-Warning "[ERROR] Failed to start dev server: $ErrorMessage"
        }
    }

    try {
        $entryTypeStr = $eventParams['EntryType']
        $entryType = [System.Diagnostics.EventLogEntryType]$entryTypeStr
        [System.Diagnostics.EventLog]::WriteEntry(
            $script:EventSource,
            $eventParams['Message'],
            $entryType,
            $eventParams['EventId']
        )
    }
    catch {
        Write-Warning "Could not write to Event Log: $_"
    }
}

function Test-PortListening {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [int]$Port
    )

    $tcpClient = [System.Net.Sockets.TcpClient]::new()
    try {
        $tcpClient.Connect('localhost', $Port)
        return $true
    }
    catch [System.Net.Sockets.SocketException] {
        return $false
    }
    finally {
        $tcpClient.Dispose()
    }
}

function Test-DevServerProcess {
    <#
    .SYNOPSIS
        Checks if a node process is running from the CareerPilot directory.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param()

    $nodeProcesses = Get-Process -Name 'node' -ErrorAction SilentlyContinue
    if (-not $nodeProcesses) {
        return $false
    }

    # Check if any node process has CareerPilot in its command line
    foreach ($proc in $nodeProcesses) {
        try {
            $wmiProc = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue
            if ($wmiProc -and $wmiProc.CommandLine) {
                $cmdLine = $wmiProc.CommandLine
                if ($cmdLine -like '*CareerPilot*') {
                    return $true
                }
            }
        }
        catch {
            # Process may have exited between enumeration and query
            continue
        }
    }
    return $false
}

# --- Main Execution ---

Initialize-EventLogSource

# Check if server is already running on the port
$portListening = Test-PortListening -Port $Port

if ($portListening) {
    Write-KeepAliveLog -Status 'AlreadyRunning' -Port $Port
    exit 0
}

# Check for existing CareerPilot node process that may still be starting
$processExists = Test-DevServerProcess
if ($processExists) {
    Write-Verbose "Node process for CareerPilot detected but port $Port not yet listening. Skipping start."
    Write-KeepAliveLog -Status 'AlreadyRunning' -Port $Port
    exit 0
}

# Server is not running — start it
Write-Verbose "Port $Port not in use. Starting dev server..."

try {
    # Explicitly resolve npm.cmd — PowerShell 7 prefers npm.ps1 which
    # Start-Process cannot launch ("not a valid Win32 application")
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source

    $startParams = @{
        FilePath         = $npmPath
        ArgumentList     = 'run', 'dev'
        WorkingDirectory = $DashboardDir
        WindowStyle      = 'Hidden'
        PassThru         = $true
    }
    $proc = Start-Process @startParams

    $procId = $proc.Id
    Write-Verbose "Started npm run dev (PID $procId). Waiting $StartupWaitSeconds seconds..."

    Start-Sleep -Seconds $StartupWaitSeconds

    # Verify the server came up
    $portListening = Test-PortListening -Port $Port

    if ($portListening) {
        Write-KeepAliveLog -Status 'Started' -Port $Port -ProcessId $procId
        exit 0
    }
    else {
        Write-KeepAliveLog -Status 'StartedPendingVerify' -Port $Port -ProcessId $procId
        exit 1
    }
}
catch {
    $errMsg = $_.Exception.Message
    Write-KeepAliveLog -Status 'Failed' -Port $Port -ErrorMessage $errMsg
    exit 1
}
