# post-edit-test.ps1 — PostToolUse hook for automatic quick regression testing
# Runs test_pipeline.py --quick after edits to core pipeline files.
# Always exits 0 (non-blocking) — output is visible to Claude for diagnosis.

# Core pipeline files that trigger the test suite
$coreFiles = @(
    'tools/pdf_to_balabolka.py',
    'tools/pattern_db.py',
    'tools/visual_qa.py',
    'tools/test_pipeline.py',
    'module/EbookAutomation.psm1'
)

# Read tool event JSON from stdin
$inputJson = $null
try {
    $inputJson = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    exit 0
}

# Extract the edited file path from tool_input or tool_response
$filePath = $null
if ($inputJson.tool_input -and $inputJson.tool_input.file_path) {
    $filePath = $inputJson.tool_input.file_path
} elseif ($inputJson.tool_response -and $inputJson.tool_response.filePath) {
    $filePath = $inputJson.tool_response.filePath
}

if (-not $filePath) { exit 0 }

# Normalize to forward slashes and extract relative path
$normalized = $filePath -replace '\\', '/'
$isCore = $false
foreach ($core in $coreFiles) {
    if ($normalized -like "*/$core" -or $normalized -eq $core) {
        $isCore = $true
        break
    }
}

if (-not $isCore) { exit 0 }

# Resolve project root (two levels up from this script)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

Write-Host ""
Write-Host "===== POST-EDIT QUICK TEST =====" -ForegroundColor Cyan
Write-Host "Triggered by: $filePath" -ForegroundColor Cyan
Write-Host "Running: python tools/test_pipeline.py --quick" -ForegroundColor Cyan
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    $output = & python "$projectRoot\tools\test_pipeline.py" --quick 2>&1
    $exitCode = $LASTEXITCODE
    $sw.Stop()

    # Display output
    $output | ForEach-Object { Write-Host $_ }

    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "QUICK TEST PASSED ($([math]::Round($sw.Elapsed.TotalSeconds))s)" -ForegroundColor Green
    } else {
        Write-Host "REGRESSION DETECTED ($([math]::Round($sw.Elapsed.TotalSeconds))s) — STOP and diagnose before continuing!" -ForegroundColor Red
    }
    Write-Host "=================================" -ForegroundColor Cyan
} catch {
    $sw.Stop()
    Write-Host "Hook error: $_" -ForegroundColor Yellow
    Write-Host "=================================" -ForegroundColor Cyan
}

exit 0
