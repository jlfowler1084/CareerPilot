#Requires -Version 7.0
<#
.SYNOPSIS
    Filters qualifying jobs from scan_results and inserts them into auto_apply_queue
    as "pending" for the 8 AM dashboard review.

.DESCRIPTION
    Reads from the legacy scan_results table. Note: the upstream populator
    (Invoke-CPJobScan.ps1) was deprecated 2026-04-28 in favor of the Python
    pipeline, which writes to job_search_results. This script is therefore
    operating on a frozen-in-place table; consider migrating it to read
    from job_search_results, or retiring the CareerPilot-SBAutoQueue task.

    Qualifying: fit_score >= MinScore, easy_apply = true (unless -IncludeAllSources),
    not already queued or applied.

.PARAMETER MinScore
    Minimum fit score to queue (default 60).

.PARAMETER HighPriorityThreshold
    Score threshold for 'high' priority (default 80). Below = 'normal'.

.PARAMETER IncludeAllSources
    Override: queue non-Easy Apply jobs too.

.PARAMETER DaysBack
    How far back to look in scan_results (default 1).
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [int]$MinScore = 60,
    [int]$HighPriorityThreshold = 80,
    [switch]$IncludeAllSources,
    [int]$DaysBack = 1
)

$ErrorActionPreference = 'Continue'

# --- Load Environment ────────────────────────────────────────────────────────

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $ProjectRoot 'config\scan.env'

if (-not (Test-Path $EnvFile)) {
    Write-Error "Config file not found: $EnvFile — copy config\scan.env.example and populate"
    return
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)\s*$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}

$SupabaseUrl = $env:SUPABASE_URL
$SupabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY
$UserId = $env:CP_USER_ID

if (-not $SupabaseUrl -or -not $SupabaseKey -or -not $UserId) {
    Write-Error "Missing required environment variables in scan.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CP_USER_ID)"
    return
}

$Headers = @{
    'apikey'        = $SupabaseKey
    'Authorization' = "Bearer $SupabaseKey"
    'Content-Type'  = 'application/json'
    'Prefer'        = 'return=representation'
}
$ReadHeaders = @{
    'apikey'        = $SupabaseKey
    'Authorization' = "Bearer $SupabaseKey"
}

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "[$ts] [$Level] $Message"
}

# --- Step 1: Query unprocessed scan_results ──────────────────────────────────

$cutoffDate = (Get-Date).AddDays(-$DaysBack).ToString('yyyy-MM-dd')
$filter = "user_id=eq.$UserId&scan_date=gte.$cutoffDate&fit_score=gte.$MinScore&queued=eq.false"
if (-not $IncludeAllSources) {
    $filter += "&easy_apply=eq.true"
}

Write-Log "Querying scan_results: score >= $MinScore, last $DaysBack day(s), easy_apply=$(if ($IncludeAllSources) {'any'} else {'true'})"

$scanResults = @()
try {
    $resp = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_results?$filter&select=*&order=fit_score.desc" `
        -Headers $ReadHeaders -Method Get
    $scanResults = @($resp | Where-Object { $null -ne $_ })
} catch {
    Write-Log "Failed to query scan_results: $_" -Level 'ERROR'
    return
}

Write-Log "Found $($scanResults.Count) qualifying scan results"

if ($scanResults.Count -eq 0) {
    Write-Host "`nAuto-Apply Queue Updated:"
    Write-Host "  Scanned: 0 results from last $DaysBack day(s)"
    Write-Host "  No qualifying jobs to queue."
    return
}

# --- Step 2: Load existing queue entries for dedup ───────────────────────────

$existingQueue = @()
try {
    $resp = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/auto_apply_queue?user_id=eq.$UserId&select=job_title,company" `
        -Headers $ReadHeaders -Method Get
    $existingQueue = @($resp | Where-Object { $null -ne $_ })
} catch {
    Write-Log "Warning: Could not load auto_apply_queue for dedup: $_" -Level 'WARN'
}

$queueSet = @{}
foreach ($q in $existingQueue) {
    $key = "$($q.job_title.ToLower())|$($q.company.ToLower())"
    $queueSet[$key] = $true
}

# --- Step 3: Load existing applications for dedup ────────────────────────────

$existingApps = @()
try {
    $resp = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/applications?user_id=eq.$UserId&select=title,company" `
        -Headers $ReadHeaders -Method Get
    $existingApps = @($resp | Where-Object { $null -ne $_ })
} catch {
    Write-Log "Warning: Could not load applications for dedup: $_" -Level 'WARN'
}

$appSet = @{}
foreach ($a in $existingApps) {
    $key = "$($a.title.ToLower())|$($a.company.ToLower())"
    $appSet[$key] = $true
}

# --- Step 4: Filter and insert ───────────────────────────────────────────────

$skippedQueue = 0
$skippedApplied = 0
$newQueued = 0
$highPriority = 0
$normalPriority = 0

foreach ($result in $scanResults) {
    $dedupKey = "$($result.title.ToLower())|$($result.company.ToLower())"

    # Already in queue?
    if ($queueSet.ContainsKey($dedupKey)) {
        $skippedQueue++
        continue
    }

    # Already applied?
    if ($appSet.ContainsKey($dedupKey)) {
        $skippedApplied++
        continue
    }

    $priority = if ($result.fit_score -ge $HighPriorityThreshold) { 'high' } else { 'normal' }

    if ($PSCmdlet.ShouldProcess("$($result.title) at $($result.company)", "Queue for auto-apply (score: $($result.fit_score), priority: $priority)")) {
        try {
            $queueBody = @{
                user_id         = $UserId
                job_title       = $result.title
                company         = $result.company
                location        = $result.location
                salary          = $result.salary
                job_url         = $result.job_url
                source          = $result.source
                easy_apply      = $result.easy_apply
                fit_score       = $result.fit_score
                score_breakdown = $result.score_breakdown
                status          = 'pending'
                priority        = $priority
                source_scan_id  = $result.id
            } | ConvertTo-Json -Depth 5

            Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/auto_apply_queue" `
                -Headers $Headers -Method Post -Body $queueBody -ErrorAction Stop | Out-Null

            # Mark scan_result as queued
            Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_results?id=eq.$($result.id)" `
                -Headers $Headers -Method Patch `
                -Body (@{ queued = $true } | ConvertTo-Json) -ErrorAction Stop | Out-Null

            $newQueued++
            if ($priority -eq 'high') { $highPriority++ } else { $normalPriority++ }

            # Track for dedup within this batch
            $queueSet[$dedupKey] = $true

            Write-Log "  >> Queued: $($result.title) @ $($result.company) (score: $($result.fit_score), priority: $priority)"
        } catch {
            Write-Log "  Failed to queue $($result.title): $_" -Level 'WARN'
        }
    }
}

# --- Step 5: Get final pending count ─────────────────────────────────────────

$pendingCount = 0
try {
    $pending = @(Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/auto_apply_queue?user_id=eq.$UserId&status=eq.pending&select=id" `
        -Headers $ReadHeaders -Method Get)
    $pendingCount = $pending.Count
} catch {
    Write-Log "Could not get pending count: $_" -Level 'WARN'
}

# --- Summary ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Auto-Apply Queue Updated:" -ForegroundColor Cyan
Write-Host "  Scanned:         $($scanResults.Count) results from last $DaysBack day(s)"
Write-Host "  Qualifying:      $($scanResults.Count) (score >= $MinScore$(if (-not $IncludeAllSources) {', Easy Apply'}))"
Write-Host "  Already queued:  $skippedQueue (skipped)"
Write-Host "  Already applied: $skippedApplied (skipped)"
Write-Host "  NEW queued:      $newQueued ($highPriority high priority, $normalPriority normal priority)"
Write-Host "  Queue total:     $pendingCount pending items ready for review"
