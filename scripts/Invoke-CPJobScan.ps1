#Requires -Version 7.0
<#
.SYNOPSIS
    CareerPilot Morning Job Scan — queries all search profiles against Dice and Indeed MCPs,
    scores results, deduplicates against recent scans, stores in Supabase, and auto-queues
    high-scoring Easy Apply jobs.

.DESCRIPTION
    Designed to run via Windows Task Scheduler at 7:00 AM daily.
    Uses Anthropic API with Haiku model as a relay to Dice/Indeed MCP servers.
    All results stored in Supabase scan_results table.
#>

$ErrorActionPreference = 'Continue'

# --- Load Environment ────────────────────────────────────────────────────────

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $ProjectRoot 'config\scan.env'

if (-not (Test-Path $EnvFile)) {
    Write-Error "Config file not found: $EnvFile — copy config\scan.env.example and populate"
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)\s*$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}

$SupabaseUrl = $env:SUPABASE_URL
$SupabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY
$AnthropicKey = $env:ANTHROPIC_API_KEY
$UserId = $env:CP_USER_ID

if (-not $SupabaseUrl -or -not $SupabaseKey -or -not $AnthropicKey -or -not $UserId) {
    Write-Error "Missing required environment variables in scan.env"
    exit 1
}

$ScanDate = Get-Date -Format 'yyyy-MM-dd'
$Headers = @{
    'apikey'        = $SupabaseKey
    'Authorization' = "Bearer $SupabaseKey"
    'Content-Type'  = 'application/json'
    'Prefer'        = 'return=representation'
}

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "[$ts] [$Level] $Message"
}

# --- Irrelevant title filter ─────────────────────────────────────────────────

$IrrelevantTitles = @(
    'pest control', 'hvac', 'construction project', 'transportation engineer',
    'mechanical', 'civil engineer', 'epc project', 'glazier', 'carpenter',
    'plumber', 'electrician', 'welder', 'custodian'
)

function Test-IrrelevantTitle {
    param([string]$Title)
    $lower = $Title.ToLower()
    foreach ($term in $IrrelevantTitles) {
        if ($lower -like "*$term*") { return $true }
    }
    return $false
}

# --- Salary Parser ───────────────────────────────────────────────────────────

function ConvertTo-AnnualSalary {
    param([string]$SalaryStr)
    if (-not $SalaryStr -or $SalaryStr -eq 'Not listed') { return $null }

    $s = $SalaryStr -replace ',', '' -replace '\$', ''
    $isHourly = $s -match '/(hr|hour|h)\b'

    $nums = [regex]::Matches($s, '(\d+(?:\.\d+)?)\s*k?', 'IgnoreCase') |
        ForEach-Object {
            $val = [double]$_.Groups[1].Value
            if ($_.Value -imatch 'k') { $val *= 1000 }
            if ($isHourly) { $val *= 2080 }
            $val
        } | Where-Object { $_ -ge 1000 }

    if ($nums.Count -eq 0) { return $null }
    if ($nums.Count -ge 2) { return [math]::Round(($nums[0] + $nums[1]) / 2) }
    return [math]::Round($nums[0])
}

# --- Skills Inventory (loaded from Supabase) ─────────────────────────────────

$SkillsData = @()
try {
    $skillsResp = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/skills_inventory?user_id=eq.$UserId&select=skill_name,category,weight,aliases" `
        -Headers @{ 'apikey' = $SupabaseKey; 'Authorization' = "Bearer $SupabaseKey" } -Method Get
    $SkillsData = $skillsResp
    Write-Log "Loaded $($SkillsData.Count) skills from inventory"
} catch {
    Write-Log "Warning: Could not load skills inventory: $_" -Level 'WARN'
}

# --- Scoring Function ────────────────────────────────────────────────────────

$TargetTitles = @(
    'systems administrator', 'systems engineer', 'infrastructure engineer',
    'devops engineer', 'automation engineer', 'powershell engineer', 'cloud engineer'
)
$PartialKeywords = @('administrator', 'engineer', 'analyst')
$ContextKeywords = @('system', 'infrastructure', 'it', 'network', 'cloud')
$GenericIT = @('technician', 'support', 'helpdesk', 'specialist')
$NegativeSignals = @('senior director', 'vp', 'vice president', 'manager', 'lead architect', 'principal')
$NegativeExceptions = @('systems manager', 'infrastructure manager')

$IndyTerms = @('indianapolis', 'indy', 'carmel', 'fishers', 'noblesville', 'sheridan', 'westfield', 'zionsville')
$MidwestStates = @('ohio', ', oh', 'illinois', ', il', 'michigan', ', mi', 'kentucky', ', ky')

function Get-JobScore {
    param(
        [string]$Title,
        [string]$Company,
        [string]$Location,
        [string]$Salary,
        [string]$JobType
    )

    $lower = $Title.ToLower()
    $breakdown = @{ title = 0; skills = 0; location = 0; salary = 0 }

    # -- Title Score (0-30) --
    $titleScore = 0
    if ($TargetTitles -contains $lower) {
        $titleScore = 30
    } elseif (($PartialKeywords | Where-Object { $lower -like "*$_*" }) -and ($ContextKeywords | Where-Object { $lower -like "*$_*" })) {
        $titleScore = 20
    } elseif ($GenericIT | Where-Object { $lower -like "*$_*" }) {
        $titleScore = 10
    }

    # Negative signals
    $hasException = $NegativeExceptions | Where-Object { $lower -like "*$_*" }
    if (-not $hasException) {
        $hasNeg = $NegativeSignals | Where-Object { $lower -like "*$_*" }
        if ($hasNeg) { $titleScore = [math]::Max(0, $titleScore - 10) }
    }
    $breakdown.title = $titleScore

    # -- Skills Score (0-40) --
    $searchText = "$Title $Company $JobType".ToLower()
    $totalWeight = 0.0
    foreach ($skill in $SkillsData) {
        $matched = $false
        if ($searchText -like "*$($skill.skill_name.ToLower())*") { $matched = $true }
        if (-not $matched -and $skill.aliases) {
            foreach ($alias in $skill.aliases) {
                if ($searchText -like "*$($alias.ToLower())*") { $matched = $true; break }
            }
        }
        if ($matched) { $totalWeight += $skill.weight }
    }
    # Normalize: max possible = sum of top 5 weights
    $maxWeight = ($SkillsData | Sort-Object weight -Descending | Select-Object -First 5 | Measure-Object -Property weight -Sum).Sum
    if ($maxWeight -gt 0) {
        $breakdown.skills = [math]::Min(40, [math]::Round(($totalWeight / $maxWeight) * 40))
    } elseif ($SkillsData.Count -eq 0) {
        $breakdown.skills = 20 # neutral if no skills loaded
    }

    # -- Location Score (0-15) --
    $loc = $Location.ToLower()
    if (-not $loc -or $loc -eq '') {
        $breakdown.location = 8
    } elseif ($loc -like '*remote*' -or $loc -like '*work from home*') {
        $breakdown.location = 12
    } elseif ($IndyTerms | Where-Object { $loc -like "*$_*" }) {
        $breakdown.location = 15
    } elseif ($loc -like '*indiana*' -or $loc -like '*, in*') {
        $breakdown.location = 12
    } elseif ($MidwestStates | Where-Object { $loc -like "*$_*" }) {
        $breakdown.location = 8
    } else {
        $breakdown.location = 5
    }

    # -- Salary Score (0-15) --
    $annual = ConvertTo-AnnualSalary $Salary
    if ($null -eq $annual) {
        $breakdown.salary = 5
    } elseif ($annual -ge 100000) {
        $breakdown.salary = 15
    } elseif ($annual -ge 80000) {
        $breakdown.salary = 12
    } elseif ($annual -ge 60000) {
        $breakdown.salary = 8
    } else {
        $breakdown.salary = 3
    }

    $total = $breakdown.title + $breakdown.skills + $breakdown.location + $breakdown.salary
    return @{
        total     = [math]::Min(100, $total)
        breakdown = $breakdown
    }
}

# --- Search Functions ─────────────────────────────────────────────────────────

function Invoke-DiceSearch {
    param([string]$Keyword, [string]$Location, [bool]$ContractOnly = $false)

    $message = "Search Dice for `"$Keyword`" jobs near `"$Location`" within 50 miles. Return 15 results. Return the raw JSON."
    if ($ContractOnly) { $message += " Filter for contract positions only." }

    $body = @{
        model      = 'claude-haiku-4-5-20251001'
        max_tokens = 4000
        system     = 'You are a job search assistant. Use the Dice MCP tool to search for jobs. Return the raw tool results exactly as provided in JSON format. Do not add commentary or reformatting.'
        messages   = @(@{ role = 'user'; content = $message })
        mcp_servers = @(@{ type = 'url'; url = 'https://mcp.dice.com/mcp'; name = 'dice' })
    } | ConvertTo-Json -Depth 10

    $resp = Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/messages' -Method Post `
        -Headers @{
            'x-api-key'         = $AnthropicKey
            'anthropic-version' = '2023-06-01'
            'Content-Type'      = 'application/json'
        } -Body $body -TimeoutSec 60

    $text = ($resp.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n"
    return Parse-DiceResults $text
}

function Parse-DiceResults {
    param([string]$Text)
    $jobs = @()

    # Try to find JSON array with job data
    if ($Text -match '\{[\s\S]*"data"\s*:\s*\[[\s\S]*\]') {
        try {
            $jsonMatch = [regex]::Match($Text, '\{[\s\S]*"data"\s*:\s*\[[\s\S]*?\]\s*\}')
            if ($jsonMatch.Success) {
                $parsed = $jsonMatch.Value | ConvertFrom-Json
                $items = if ($parsed.data) { $parsed.data } else { @() }
                foreach ($item in $items) {
                    $title = if ($item.title) { $item.title } elseif ($item.jobTitle) { $item.jobTitle } else { '' }
                    if (-not $title) { continue }
                    $jobs += @{
                        title       = $title
                        company     = if ($item.companyName) { $item.companyName } elseif ($item.company) { $item.company } else { 'Unknown' }
                        location    = if ($item.jobLocation) { $item.jobLocation.displayName } elseif ($item.location) { $item.location } else { '' }
                        salary      = if ($item.salary) { $item.salary } elseif ($item.compensation) { $item.compensation } else { 'Not listed' }
                        job_url     = if ($item.detailsPageUrl) { $item.detailsPageUrl } elseif ($item.url) { $item.url } else { '' }
                        posted_date = if ($item.postedDate) { $item.postedDate } else { '' }
                        job_type    = if ($item.employmentType) { $item.employmentType } elseif ($item.type) { $item.type } else { '' }
                        easy_apply  = if ($null -ne $item.easyApply) { [bool]$item.easyApply } else { $false }
                        source      = 'dice'
                    }
                }
            }
        } catch { Write-Log "Dice JSON parse error: $_" -Level 'WARN' }
    }

    # Fallback: try generic JSON array
    if ($jobs.Count -eq 0 -and $Text -match '\[[\s\S]*\{[\s\S]*"title"') {
        try {
            $arrMatch = [regex]::Match($Text, '\[[\s\S]*\]')
            if ($arrMatch.Success) {
                $items = $arrMatch.Value | ConvertFrom-Json
                foreach ($item in $items) {
                    $title = if ($item.title) { $item.title } else { '' }
                    if (-not $title) { continue }
                    $jobs += @{
                        title       = $title
                        company     = if ($item.company) { $item.company } elseif ($item.companyName) { $item.companyName } else { 'Unknown' }
                        location    = if ($item.location) { $item.location } else { '' }
                        salary      = if ($item.salary) { $item.salary } else { 'Not listed' }
                        job_url     = if ($item.url) { $item.url } else { '' }
                        posted_date = if ($item.postedDate) { $item.postedDate } elseif ($item.posted) { $item.posted } else { '' }
                        job_type    = if ($item.type) { $item.type } elseif ($item.employmentType) { $item.employmentType } else { '' }
                        easy_apply  = $false
                        source      = 'dice'
                    }
                }
            }
        } catch { Write-Log "Dice fallback parse error: $_" -Level 'WARN' }
    }

    return $jobs
}

function Invoke-IndeedSearch {
    param([string]$Keyword, [string]$Location)

    $body = @{
        model      = 'claude-haiku-4-5-20251001'
        max_tokens = 4000
        system     = "You are a job data extraction tool. Use the Indeed MCP search_jobs tool to find jobs. Return ONLY a JSON array of job objects with fields: title, company, location, salary, url, job_type, posted_date. No commentary."
        messages   = @(@{ role = 'user'; content = "Search Indeed for `"$Keyword`" jobs in `"$Location`" in the US. Return all results as a JSON array." })
        mcp_servers = @(@{ type = 'url'; url = 'https://mcp.indeed.com/claude/mcp'; name = 'indeed' })
    } | ConvertTo-Json -Depth 10

    $resp = Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/messages' -Method Post `
        -Headers @{
            'x-api-key'         = $AnthropicKey
            'anthropic-version' = '2023-06-01'
            'Content-Type'      = 'application/json'
        } -Body $body -TimeoutSec 60

    $text = ($resp.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n"
    return Parse-IndeedResults $text
}

function Parse-IndeedResults {
    param([string]$Text)
    $jobs = @()

    # Try JSON array first
    if ($Text -match '\[[\s\S]*\{[\s\S]*"title"') {
        try {
            $arrMatch = [regex]::Match($Text, '\[[\s\S]*\]')
            if ($arrMatch.Success) {
                $items = $arrMatch.Value | ConvertFrom-Json
                foreach ($item in $items) {
                    $title = if ($item.title) { $item.title } else { '' }
                    if (-not $title -or $title.Length -gt 80) { continue }
                    $jobs += @{
                        title       = $title
                        company     = if ($item.company) { $item.company } else { 'Unknown' }
                        location    = if ($item.location) { $item.location } else { '' }
                        salary      = if ($item.salary) { $item.salary } else { 'Not listed' }
                        job_url     = if ($item.url) { $item.url } else { '' }
                        posted_date = if ($item.posted_date) { $item.posted_date } elseif ($item.postedDate) { $item.postedDate } else { '' }
                        job_type    = if ($item.job_type) { $item.job_type } elseif ($item.jobType) { $item.jobType } else { '' }
                        easy_apply  = $false
                        source      = 'indeed'
                    }
                }
            }
        } catch { Write-Log "Indeed JSON parse error: $_" -Level 'WARN' }
    }

    # Fallback: markdown format
    if ($jobs.Count -eq 0) {
        $blocks = $Text -split '\*\*Job Title:\*\*'
        foreach ($block in $blocks) {
            if (-not $block.Trim()) { continue }
            $titleLine = ($block -split "`n")[0].Trim()
            if (-not $titleLine -or $titleLine.Length -gt 80) { continue }
            if ($titleLine -match '^(I can see|I found|The search|Let me|Here are|Based on)') { continue }

            $company = if ($block -match '\*\*Company:\*\*\s*(.+)') { $matches[1].Trim() } else { 'Unknown' }
            $location = if ($block -match '\*\*Location:\*\*\s*(.+)') { $matches[1].Trim() } else { '' }
            $salary = if ($block -match '\*\*Compensation:\*\*\s*(.+)') { $matches[1].Trim() } else { 'Not listed' }
            $url = if ($block -match '\*\*View Job URL:\*\*\s*(https?://\S+)') { $matches[1].Trim() } else { '' }
            $posted = if ($block -match '\*\*Posted on:\*\*\s*(.+)') { $matches[1].Trim() } else { '' }
            $type = if ($block -match '\*\*Job Type:\*\*\s*(.+)') { $matches[1].Trim() } else { '' }

            $jobs += @{
                title       = $titleLine
                company     = $company
                location    = $location
                salary      = $salary
                job_url     = $url
                posted_date = $posted
                job_type    = $type
                easy_apply  = $false
                source      = 'indeed'
            }
        }
    }

    return $jobs
}

# --- Dedup Check ──────────────────────────────────────────────────────────────

function Test-DuplicateResult {
    param([string]$Title, [string]$Company)
    $sevenDaysAgo = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd')
    $encodedTitle = [uri]::EscapeDataString($Title.ToLower())
    $encodedCompany = [uri]::EscapeDataString($Company.ToLower())

    try {
        $existing = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_results?user_id=eq.$UserId&title=ilike.$encodedTitle&company=ilike.$encodedCompany&scan_date=gte.$sevenDaysAgo&select=id&limit=1" `
            -Headers @{ 'apikey' = $SupabaseKey; 'Authorization' = "Bearer $SupabaseKey" } -Method Get
        return ($existing.Count -gt 0)
    } catch {
        return $false
    }
}

# --- Main Scan Loop ──────────────────────────────────────────────────────────

Write-Log "=========================================="
Write-Log "CareerPilot Morning Scan — $ScanDate"
Write-Log "=========================================="

# Create scan_metadata record
$metadataId = $null
try {
    $metaBody = @{
        user_id    = $UserId
        scan_date  = $ScanDate
        started_at = (Get-Date -Format 'o')
        status     = 'running'
    } | ConvertTo-Json

    $metaResp = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_metadata" `
        -Headers $Headers -Method Post -Body $metaBody
    $metadataId = $metaResp[0].id
    Write-Log "Scan metadata created: $metadataId"
} catch {
    Write-Log "Failed to create scan metadata: $_" -Level 'ERROR'
}

# Load search profiles
$profiles = @()
try {
    $profiles = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/search_profiles?user_id=eq.$UserId&select=*" `
        -Headers @{ 'apikey' = $SupabaseKey; 'Authorization' = "Bearer $SupabaseKey" } -Method Get
    Write-Log "Loaded $($profiles.Count) search profiles"
} catch {
    Write-Log "Failed to load profiles: $_" -Level 'ERROR'
    if ($metadataId) {
        $failBody = @{ status = 'failed'; completed_at = (Get-Date -Format 'o'); errors = @("Failed to load profiles: $_") } | ConvertTo-Json
        Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_metadata?id=eq.$metadataId" -Headers $Headers -Method Patch -Body $failBody -ErrorAction SilentlyContinue
    }
    exit 1
}

$totalResults = 0
$newResults = 0
$duplicatesSkipped = 0
$autoQueued = 0
$errors = @()
$profilesScanned = 0

foreach ($profile in $profiles) {
    $pName = $profile.name
    $pKeyword = $profile.keyword
    $pLocation = $profile.location
    $pSource = $profile.source

    Write-Log "--- Profile: $pName ($pSource) ---"

    $allJobs = @()

    # Dice search
    if ($pSource -in @('dice', 'dice_contract', 'both')) {
        try {
            $contractOnly = ($pSource -eq 'dice_contract')
            $diceJobs = Invoke-DiceSearch -Keyword $pKeyword -Location $pLocation -ContractOnly $contractOnly
            $allJobs += $diceJobs
            Write-Log "  Dice: $($diceJobs.Count) results"
        } catch {
            Write-Log "  Dice search failed: $_" -Level 'WARN'
            $errors += "Dice failed for $pName`: $_"
            # Retry once
            Start-Sleep -Seconds 5
            try {
                $diceJobs = Invoke-DiceSearch -Keyword $pKeyword -Location $pLocation -ContractOnly $contractOnly
                $allJobs += $diceJobs
                Write-Log "  Dice retry: $($diceJobs.Count) results"
            } catch {
                Write-Log "  Dice retry also failed: $_" -Level 'ERROR'
            }
        }
    }

    # Indeed search
    if ($pSource -in @('indeed', 'both')) {
        try {
            $indeedJobs = Invoke-IndeedSearch -Keyword $pKeyword -Location $pLocation
            $allJobs += $indeedJobs
            Write-Log "  Indeed: $($indeedJobs.Count) results"
        } catch {
            Write-Log "  Indeed search failed: $_" -Level 'WARN'
            $errors += "Indeed failed for $pName`: $_"
            Start-Sleep -Seconds 5
            try {
                $indeedJobs = Invoke-IndeedSearch -Keyword $pKeyword -Location $pLocation
                $allJobs += $indeedJobs
                Write-Log "  Indeed retry: $($indeedJobs.Count) results"
            } catch {
                Write-Log "  Indeed retry also failed: $_" -Level 'ERROR'
            }
        }
    }

    $profilesScanned++

    foreach ($job in $allJobs) {
        # Filter irrelevant
        if (Test-IrrelevantTitle $job.title) {
            Write-Log "  SKIP (irrelevant): $($job.title)" -Level 'DEBUG'
            continue
        }

        $totalResults++

        # Dedup check
        if (Test-DuplicateResult -Title $job.title -Company $job.company) {
            $duplicatesSkipped++
            continue
        }

        # Score
        $score = Get-JobScore -Title $job.title -Company $job.company -Location $job.location -Salary $job.salary -JobType $job.job_type

        # Insert into scan_results
        try {
            $insertBody = @{
                user_id         = $UserId
                profile_id      = $profile.id
                profile_name    = $pName
                title           = $job.title
                company         = $job.company
                location        = $job.location
                salary          = $job.salary
                job_url         = $job.job_url
                source          = $job.source
                job_type        = $job.job_type
                posted_date     = if ($job.posted_date) { $job.posted_date } else { $null }
                easy_apply      = $job.easy_apply
                fit_score       = $score.total
                score_breakdown = $score.breakdown
                scan_date       = $ScanDate
                viewed          = $false
                queued          = $false
                dismissed       = $false
            } | ConvertTo-Json -Depth 5

            Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_results" `
                -Headers $Headers -Method Post -Body $insertBody -ErrorAction Stop | Out-Null
            $newResults++

            Write-Log "  + $($job.title) @ $($job.company) -- Score: $($score.total) [T:$($score.breakdown.title) S:$($score.breakdown.skills) L:$($score.breakdown.location) SAL:$($score.breakdown.salary)]"

            # Auto-queue high scorers with Easy Apply
            if ($score.total -ge 80 -and $job.easy_apply) {
                try {
                    # Check if already in queue
                    $existing = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/auto_apply_queue?user_id=eq.$UserId&job_title=ilike.$([uri]::EscapeDataString($job.title))&company=ilike.$([uri]::EscapeDataString($job.company))&select=id&limit=1" `
                        -Headers @{ 'apikey' = $SupabaseKey; 'Authorization' = "Bearer $SupabaseKey" } -Method Get

                    if ($existing.Count -eq 0) {
                        $queueBody = @{
                            user_id         = $UserId
                            job_title       = $job.title
                            company         = $job.company
                            location        = $job.location
                            salary          = $job.salary
                            job_url         = $job.job_url
                            source          = $job.source
                            easy_apply      = $true
                            fit_score       = $score.total
                            score_breakdown = $score.breakdown
                            status          = 'pending'
                        } | ConvertTo-Json -Depth 5

                        Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/auto_apply_queue" `
                            -Headers $Headers -Method Post -Body $queueBody -ErrorAction Stop | Out-Null
                        $autoQueued++
                        Write-Log "  >> Auto-queued: $($job.title) (score $($score.total))"
                    }
                } catch {
                    Write-Log "  Auto-queue failed for $($job.title): $_" -Level 'WARN'
                }
            }
        } catch {
            if ($_ -match 'duplicate key|unique constraint|23505') {
                $duplicatesSkipped++
            } else {
                Write-Log "  Insert failed for $($job.title): $_" -Level 'WARN'
                $errors += "Insert failed: $($job.title) — $_"
            }
        }
    }

    Write-Log "  Profile complete: $($allJobs.Count) raw, $newResults new total"
}

# --- Update Metadata ─────────────────────────────────────────────────────────

if ($metadataId) {
    try {
        $updateBody = @{
            completed_at      = (Get-Date -Format 'o')
            profiles_scanned  = $profilesScanned
            total_results     = $totalResults
            new_results       = $newResults
            duplicates_skipped = $duplicatesSkipped
            auto_queued       = $autoQueued
            errors            = $errors
            status            = 'completed'
        } | ConvertTo-Json -Depth 5

        Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/scan_metadata?id=eq.$metadataId" `
            -Headers $Headers -Method Patch -Body $updateBody | Out-Null
    } catch {
        Write-Log "Failed to update metadata: $_" -Level 'ERROR'
    }
}

Write-Log "=========================================="
Write-Log "Scan complete!"
Write-Log "  Profiles scanned: $profilesScanned"
Write-Log "  Total results: $totalResults"
Write-Log "  New results: $newResults"
Write-Log "  Duplicates skipped: $duplicatesSkipped"
Write-Log "  Auto-queued: $autoQueued"
Write-Log "  Errors: $($errors.Count)"
Write-Log "=========================================="
