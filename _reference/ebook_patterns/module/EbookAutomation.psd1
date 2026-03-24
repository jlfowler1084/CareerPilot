# EbookAutomation.psd1 — Module Manifest
@{
    ModuleVersion     = '1.1.0'
    GUID              = 'a3f2c1d4-8e7b-4a9f-b2c3-1d4e5f6a7b8c'
    Author            = 'Joe'
    Description       = 'Automated PDF/EPUB to TTS text and Kindle conversion pipeline'
    PowerShellVersion = '5.1'
    RootModule        = 'EbookAutomation.psm1'
    FunctionsToExport = @(
        'Invoke-EbookPipeline'
        'Convert-ToTTS'
        'Convert-ToKindle'
        'Send-ToKindle'
        'Convert-BriefToYouTube'
        'Install-EbookScheduledTask'
        'Uninstall-EbookScheduledTask'
        'Get-EbookTaskStatus'
        'Initialize-EbookAutomation'
        'Invoke-Balabolka'
        'Send-ToClaudeAPI'
        'Get-ChapterStructure'
        'Test-EbookPipeline'
        'Test-ConversionQuality'
        'Invoke-BatchQA'
        'Invoke-ConvergeLoop'
        'Write-EbookLog'
        'Get-EbookConfig'
    )
    PrivateData = @{
        PSData = @{
            Tags         = @('ebook', 'tts', 'kindle', 'calibre', 'automation')
            ProjectUri   = ''
            ReleaseNotes = 'v1.1.0 — Directory reorganization; default output paths; Convert-BriefToYouTube export'
        }
    }
}
