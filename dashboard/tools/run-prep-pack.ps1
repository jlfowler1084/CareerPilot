# dashboard/tools/run-prep-pack.ps1
<#
.SYNOPSIS
    Wraps Invoke-SBAutobook for the CareerPilot Prep Pack pipeline. Posts a
    Discord webhook on completion or failure.

.DESCRIPTION
    Translates wizard-supplied parameters into the cmdlet's parameter set,
    runs the full pipeline, inspects the output directories to determine
    actual artifacts produced (defends against silent KFX->AZW3 fallback
    in EbookAutomation's Convert-ToKindle), then POSTs a Discord webhook.

    Designed to be invoked detached from the Next.js API route via
    child_process.spawn. All logging goes to a per-job transcript file
    in $env:LOCALAPPDATA\CareerPilot\prep-pack\logs\<stem>.log.

.PARAMETER InputFile
    Absolute path to the assembled source .txt in the SecondBrain Inbox.

.PARAMETER Voice
    SAPI voice for TTS. One of: Steffan, Aria, Jenny, Guy.

.PARAMETER Depth
    SB-Autobook depth profile. One of: Quick, Standard, Deep.

.PARAMETER Mode
    Single = one book; Series = let SB-Autobook plan a 3-book split.

.PARAMETER ProduceKindle
    If set, also produces a Kindle ebook via ConvertTo-SBAutobookKindle.

.PARAMETER KindleFormat
    KFX (default) or AZW3. Drives EbookAutomation's output_format config via
    EBOOKAUTOMATION_KINDLE_FORMAT env var. Ignored unless -ProduceKindle is also set.

.PARAMETER DiscordWebhookUrl
    Optional. URL to POST a status payload to on completion or failure.
    If unset, the script still runs the pipeline but does not notify.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ if (-not (Test-Path $_)) { throw "Input file not found: $_" } else { $true } })]
    [string]$InputFile,

    [Parameter(Mandatory)]
    [ValidateSet('Steffan', 'Aria', 'Jenny', 'Guy')]
    [string]$Voice,

    [Parameter(Mandatory)]
    [ValidateSet('Quick', 'Standard', 'Deep')]
    [string]$Depth,

    [Parameter(Mandatory)]
    [ValidateSet('Single', 'Series')]
    [string]$Mode,

    [switch]$ProduceKindle,

    [ValidateSet('KFX', 'AZW3')]
    [string]$KindleFormat = 'KFX',

    [string]$DiscordWebhookUrl
)

$ErrorActionPreference = 'Stop'

$jobStem = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
$logDir  = Join-Path $env:LOCALAPPDATA 'CareerPilot\prep-pack\logs'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logPath = Join-Path $logDir "$jobStem.log"

Start-Transcript -Path $logPath -Append | Out-Null

$startTime = Get-Date
$structure = if ($Mode -eq 'Series') { 'Auto' } else { 'Single' }

# Apply EbookAutomation config override for kindle format via env var.
if ($ProduceKindle) {
    $env:EBOOKAUTOMATION_KINDLE_FORMAT = $KindleFormat.ToLower()
}

$exitCode = 0
$errorTail = $null

try {
    $sbModule = 'F:\Obsidian\SecondBrain\Resources\SB-PSModules\SecondBrain.psd1'
    if (Test-Path $sbModule) {
        Import-Module $sbModule -ErrorAction Stop
    } else {
        throw "SecondBrain module not found at $sbModule"
    }

    $invokeArgs = @{
        FromFile     = $InputFile
        Structure    = $structure
        Voice        = $Voice
        Depth        = $Depth
        OutputPrefix = $jobStem
    }
    if ($ProduceKindle) { $invokeArgs.ProduceKindle = $true }

    Invoke-SBAutobook @invokeArgs | Out-Null
}
catch {
    $exitCode = 1
    $errorTail = $_ | Out-String
    Write-Error $errorTail
}
finally {
    $duration = (Get-Date) - $startTime

    # Inspect actual artifacts produced.
    $artifacts = @{
        Mp3          = $null
        VaultNote    = $null
        KindleFile   = $null
        KindleFormat = $null
    }

    $audioDir = 'F:\Projects\EbookAutomation\output\audiobooks'
    if (Test-Path $audioDir) {
        $mp3 = Get-ChildItem $audioDir -Filter "*$jobStem*.mp3" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($mp3) { $artifacts.Mp3 = $mp3.FullName }
    }

    $vaultDir = 'F:\Obsidian\SecondBrain\Learning\Audiobooks'
    if (Test-Path $vaultDir) {
        $note = Get-ChildItem $vaultDir -Filter "*$jobStem*.md" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($note) { $artifacts.VaultNote = $note.FullName }
    }

    if ($ProduceKindle) {
        $kindleDir = 'F:\Projects\EbookAutomation\output\kindle'
        if (Test-Path $kindleDir) {
            $kindle = Get-ChildItem $kindleDir -Filter "*$jobStem*" -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -in @('.kfx', '.azw3') } |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($kindle) {
                $artifacts.KindleFile   = $kindle.FullName
                $artifacts.KindleFormat = $kindle.Extension.TrimStart('.').ToUpper()
            }
        }
    }

    if ($DiscordWebhookUrl) {
        $title = if ($exitCode -eq 0) {
            "Prep Pack ready: $jobStem"
        } else {
            "Prep Pack FAILED: $jobStem"
        }

        $body = if ($exitCode -eq 0) {
            $kindleNote = if ($ProduceKindle -and $artifacts.KindleFormat) {
                if ($artifacts.KindleFormat -ne $KindleFormat) {
                    "[OK] Kindle: $($artifacts.KindleFormat) (requested $KindleFormat -- fallback)"
                } else {
                    "[OK] Kindle: $($artifacts.KindleFormat)"
                }
            } elseif ($ProduceKindle) {
                "[FAIL] Kindle: requested $KindleFormat, none produced"
            } else { "" }

            @"
Runtime: $('{0:mm\:ss}' -f $duration)
[OK] MP3: $(if ($artifacts.Mp3) { Split-Path $artifacts.Mp3 -Leaf } else { 'NOT FOUND' })
[OK] Vault note: $(if ($artifacts.VaultNote) { Split-Path $artifacts.VaultNote -Leaf } else { 'NOT FOUND' })
$kindleNote
Stem: $jobStem
"@
        } else {
            $tail = if ($errorTail) {
                ($errorTail -split "`n" | Select-Object -Last 30) -join "`n"
            } else { 'No transcript captured' }

            @"
Exit code: $exitCode
Last 30 lines:
$tail
Full log: $logPath
"@
        }

        try {
            $payload = @{
                title  = $title
                body   = $body
                status = if ($exitCode -eq 0) { 'success' } else { 'failure' }
            } | ConvertTo-Json -Compress

            Invoke-RestMethod -Uri $DiscordWebhookUrl -Method Post -Body $payload `
                -ContentType 'application/json' -ErrorAction Stop | Out-Null
        }
        catch {
            Write-Warning "Discord webhook failed: $_"
        }
    }

    Stop-Transcript | Out-Null
}

exit $exitCode
