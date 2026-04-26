# dashboard/tools/run-prep-pack.Tests.ps1
# Run with: pwsh -NoProfile -Command "Invoke-Pester -Path .\run-prep-pack.Tests.ps1 -Output Detailed"
#
# Scope: parameter-validation only. Call-mapping behavior (Mode->Structure,
# ProduceKindle, OutputPrefix derivation) is verified at integration time
# in CAR-182 Task F1 E2E.

BeforeAll {
    $ScriptUnderTest = Join-Path $PSScriptRoot 'run-prep-pack.ps1'
    if (-not (Test-Path $ScriptUnderTest)) {
        throw "Script under test not found: $ScriptUnderTest"
    }
}

Describe 'run-prep-pack.ps1 parameter contract' {
    It 'rejects missing -InputFile' {
        # Mandatory parameter not supplied -> binding error.
        # Run in a non-interactive child pwsh process so the binder errors
        # out instead of prompting. Capture combined stdout+stderr.
        $psi = [System.Diagnostics.ProcessStartInfo]@{
            FileName               = 'pwsh'
            Arguments              = "-NonInteractive -NoProfile -Command `"& '$ScriptUnderTest' -Voice Steffan -Depth Standard -Mode Single`""
            RedirectStandardOutput = $true
            RedirectStandardError  = $true
            UseShellExecute        = $false
        }
        $proc = [System.Diagnostics.Process]::Start($psi)
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()

        $combined = "$stdout`n$stderr"
        $combined | Should -Match -Because 'mandatory binding fails' '(InputFile|Mandatory|cannot bind|missing|ParameterBindingException)'
    }

    It 'rejects -InputFile pointing at a non-existent path' {
        $bogus = Join-Path $env:TEMP "nonexistent-$(Get-Random).txt"
        { & $ScriptUnderTest -InputFile $bogus -Voice Steffan -Depth Standard -Mode Single } |
            Should -Throw '*not found*'
    }

    It 'rejects an invalid -Voice value via ValidateSet' {
        $tmp = New-TemporaryFile
        try {
            { & $ScriptUnderTest -InputFile $tmp.FullName -Voice Banana -Depth Standard -Mode Single } |
                Should -Throw
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }

    It 'rejects an invalid -Depth value via ValidateSet' {
        $tmp = New-TemporaryFile
        try {
            { & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Casual -Mode Single } |
                Should -Throw
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }

    It 'rejects an invalid -Mode value via ValidateSet' {
        $tmp = New-TemporaryFile
        try {
            { & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Quintet } |
                Should -Throw
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }

    It 'rejects an invalid -KindleFormat value via ValidateSet' {
        $tmp = New-TemporaryFile
        try {
            { & $ScriptUnderTest -InputFile $tmp.FullName -Voice Steffan -Depth Standard -Mode Single -ProduceKindle -KindleFormat MOBI } |
                Should -Throw
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }
}
