# CLAUDE.md — EbookAutomation Project Context

## Project Identity

EbookAutomation is a PowerShell + Python automation suite for:
- Converting ebooks (PDF, EPUB, MOBI, etc.) to TTS-ready text for Balabolka
- Converting PDFs to Kindle-formatted KFX files via Calibre
- Generating podcast/audiobook MP3s
- FOH (Fires of Heaven) forum scraping and daily brief generation

**Owner:** Joe
**Location:** `F:\Projects\EbookAutomation\`
**Platform:** Windows, PowerShell 5.1+, Python 3.8+

---

## Environment

- **OS:** Windows 10/11
- **Shell:** PowerShell 5.1+ (do NOT use bash syntax, `&` operator, or unix paths)
- **Python:** Microsoft Store Python 3.8+ (use `python -m pip install` not bare `pip`)
- **Node.js:** v24.14.0 (installed at `C:\Program Files\nodejs\`)
- **MCP config:** `.mcp.json` in project root (NOT settings.json)

This project runs on Windows. Use PowerShell syntax, not bash/Unix syntax. Do not use `&` pipe operators or Unix-style paths unless explicitly in WSL. Use backslash `\` path separators in PowerShell commands.

Use `python -m pip install` for package installs — bare `pip install` targets a different Python installation (project uses Microsoft Store Python 3.8).

Temp files may be cleaned up quickly by Windows — save diagnostic outputs to persistent locations (e.g., the project's `debug/` or `output/` directory), not system temp folders. When debugging, always verify you are looking at current output, not stale files from a previous run.

### Regression Prevention

The #1 time sink across sessions is fix-then-regression cycles: a targeted fix to headings, footnotes, or OCR cleanup breaks other books, requiring 2-4 extra debugging rounds.

**Before implementing any fix:**
1. Analyze which other books and pipeline stages could be affected
2. List the specific functions that will change and the regression risks
3. Run the full test suite to establish a clean baseline BEFORE editing code

**After implementing any fix:**
1. Run `python tools/test_pipeline.py` (full suite, all books)
2. If any book regresses, STOP — diagnose before attempting another fix
3. Never stack multiple fixes without testing between each one
4. Report test results with pass/fail counts before declaring "fix confirmed"

### MCP Fallback Strategy

The Atlassian MCP server for Jira may disconnect mid-session. Follow this escalation:
1. Try MCP tools first (1 attempt)
2. If MCP fails, immediately fall back to direct Jira REST API via PowerShell:
   ```powershell
   $headers = @{
       Authorization = "Basic $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$env:JIRA_EMAIL`:$env:JIRA_API_TOKEN")))"
       "Content-Type" = "application/json"
   }
   Invoke-RestMethod -Uri "https://jlfowler1084.atlassian.net/rest/api/3/issue/SCRUM-XX" -Headers $headers -Method Get
   ```
3. Do NOT retry MCP more than once — it wastes entire sessions
4. Jira project: SCRUM on jlfowler1084.atlassian.net, transition ID 41 = Done

---

## Testing

Before modifying heading detection, TOC generation, bookmark reconciliation, footnote linking, or OCR cleanup logic, first analyze current behavior across all 5 test books and report findings. Do NOT edit code until you've reported the diagnosis and proposed a fix strategy.

After ANY change to pipeline code, run the full 5-book test suite. Never assume a fix is isolated — heading, TOC, footnote, and OCR systems are tightly coupled. Changes to heading levels cascade into TOC nesting and Calibre compatibility. A fix for one book has broken 4 others (Genesis, Oil Kings, Dionysius, Brother of Jesus) multiple times.

If a test book regresses, stop and diagnose before attempting another fix.

### Test Commands

- Run: `python tools/test_pipeline.py` (all books)
- Run: `python tools/test_pipeline.py "Oil Kings"` (single book)
- Run: `python tools/test_pipeline.py --quick` (HTML only, skip KFX)
- Run: `powershell -File tools/test_columns.ps1` (column detection + Ezekiel extraction)
- Test cases auto-captured in `tools/test_cases.json`
- NEVER report "no regression" without actually running the test suite

After ANY code change to the pipeline:
1. Run `test_pipeline.py` against all test cases
2. Verify endnote link count hasn't decreased
3. Verify no body text tagged as headings
4. Verify chapter detection count is correct
5. Verify PAGE markers survive all processing phases
6. Report results BEFORE telling the user "fix confirmed"

### Post-Edit Auto-Test Hook

A Claude Code PostToolUse hook automatically runs `test_pipeline.py --quick` after edits to core pipeline files:
- `tools/pdf_to_balabolka.py`
- `tools/pattern_db.py`
- `tools/visual_qa.py`
- `tools/test_pipeline.py`
- `module/EbookAutomation.psm1`

This runs in `--quick` mode (HTML only, no KFX) for fast feedback (~30-60s). Full KFX testing should still be run manually before commits: `python tools/test_pipeline.py`

The hook script lives at `tools/hooks/post-edit-test.ps1`. To temporarily disable, rename or delete the PostToolUse entry in `.claude/settings.json`.

### Test Corpus (Hot Folder)

The `test-corpus/` folder at the project root holds books used for regression testing. Drop any supported ebook file (PDF, EPUB, MOBI, AZW) into this folder.

- **First run:** pipeline processes the file and captures a baseline as `<name>.baseline.json`
- **Subsequent runs:** pipeline compares against the saved baseline and reports regressions
- **Override assertions:** create `<name>.expect.json` with manual thresholds (same schema as hardcoded test expectations)
- **Re-capture:** `python tools/test_pipeline.py --corpus --recapture "<name>"`

Corpus CLI:
- `python tools/test_pipeline.py --corpus` — run only corpus tests
- `python tools/test_pipeline.py --corpus "Burge"` — run single corpus book by filename match
- `python tools/test_pipeline.py --corpus --recapture "Burge"` — re-capture baseline
- `python tools/test_pipeline.py --list` — lists corpus books and their baseline status

Core regression set (books covering distinct failure modes):

| Book | Primary Failure Mode | Extraction Path |
|------|---------------------|-----------------|
| Oil Kings | h1/h2/h3 hierarchy, blockquotes, italics, front matter, KFX TOC | pdfminer |
| Mexico Illicit | Heavy footnotes (230+), page number stripping | pdfminer |
| Ezekiel II | Multi-column layout, PyMuPDF path | PyMuPDF column |
| Burge | Paragraph flow, mid-sentence breaks, front/back matter | pdfminer |
| Genesis | Ligature splits, encoding artifacts | pdfminer |
| Fruchtenbaum | Single-column OCR/scanned PDF | pdfminer+OCR |

The harness runs all books found in `test-corpus/` — you can add more at any time.

---

## Directory Structure

```
F:\Projects\EbookAutomation\
├── config\settings.json           ← central config, all paths defined here
├── test-corpus\                   ← drop test ebooks here for regression testing
├── dictionaries\                  ← pronunciation .dic files for Balabolka
├── inbox\                         ← drop ebooks here for pipeline processing
├── logs\                          ← daily logs + processed.txt manifest
├── module\                        ← PowerShell module (PSM1 + PSD1 + launch.bat)
├── output\
│   ├── audiobooks\                ← final MP3 audiobook files
│   ├── balabolka-txt\             ← Balabolka-ready TXT files
│   ├── episodes\                  ← FOH podcast MP4/MP3 episodes
│   └── kindle\                    ← KFX Kindle conversions
├── processing\                    ← temp work area during conversion
├── archive\                       ← originals moved here after conversion
└── tools\
    ├── balcon\                    ← Balabolka CLI engine (balcon.exe)
    ├── pdf_to_balabolka.py        ← PDF text extractor (GUI + CLI)
    ├── foh_scraper.py             ← FOH forum scraper
    ├── foh_parser.py              ← FOH data parser
    ├── visual_qa.py               ← Visual QA pipeline (KFX→PDF→PNG→Claude Vision)
    ├── visual_qa_rubric.md        ← QA evaluation rubric prompt template
    ├── poppler\                   ← PDF rendering engine (pdftoppm for cover + VQA)
    └── data\                      ← scraped JSON, credentials, session files
├── prompts\                       ← Claude Code implementation prompts (mobile/Termux workflow)
```

---

## Code Conventions

### PowerShell

- Functions follow **Verb-Noun** naming: `Convert-ToTTS`, `Invoke-EbookPipeline`
- Use **`Write-EbookLog`** for all logging — never `Write-Host` or `Write-Output` directly
- Export new functions through both the `.psm1` (`Export-ModuleMember`) and the `.psd1` manifest
- All paths come from `settings.json` via `Get-EbookConfig` and `Resolve-ProjectPath` — never hardcode absolute paths
- Error handling: wrap external tool calls in `try/catch`, return `$false` on failure
- Use `Start-Process` for Calibre/FFmpeg to isolate stderr from PowerShell's error system
- `$script:ModuleRoot` = project root (one level up from `module\`)

### Python

- Use `argparse` for CLI interfaces
- Use `tkinter` for GUI
- Include `if __name__ == "__main__":` guards
- Use `logging` module or explicit `log()` callback, not bare `print()`, for status output
- On Windows, reconfigure stdout/stderr to UTF-8 when output may be captured:
  ```python
  if sys.platform == 'win32':
      sys.stdout.reconfigure(encoding='utf-8', errors='replace')
      sys.stderr.reconfigure(encoding='utf-8', errors='replace')
  ```
- Resolve file paths relative to script location using `Path(__file__).resolve().parent`

### General

- All paths configurable via `config\settings.json` — reference paths relative to project root
- When generating code, produce **complete working files**, not fragments
- When modifying existing files, show specific changes with surrounding context

---

## Key Components

### settings.json paths

```json
{
  "paths": {
    "inbox": "inbox",
    "processing": "processing",
    "archive": "archive",
    "logs": "logs",
    "dictionaries": "dictionaries",
    "audiobooks": "output\\audiobooks",
    "balabolka_txt": "output\\balabolka-txt",
    "kindle": "output\\kindle",
    "episodes": "output\\episodes",
    "balcon": "tools\\balcon\\balcon.exe",
    "data": "tools\\data",
    "ffmpeg": "ffmpeg",
    "python": "python",
    "calibre": "C:\\Program Files\\Calibre2\\ebook-convert.exe"
  },
  "visual_qa": {
    "enabled": false,
    "dpi": 150,
    "max_pages": 20,
    "pass_threshold": 70,
    "rubric_path": "tools\\visual_qa_rubric.md"
  }
}
```

### EbookAutomation.psm1 (v1.1.0) — Exported Functions

| Function | Purpose |
|---|---|
| `Invoke-EbookPipeline` | Main inbox scan + convert loop (per-book error isolation) |
| `Convert-ToTTS` | PDF/EPUB → Balabolka TXT (OutputDir optional, defaults from config) |
| `Convert-ToKindle` | PDF → clean text → KFX via Calibre (text extraction + metadata) |
| `Convert-BriefToYouTube` | MP3 segments + cover → YouTube-ready MP4s via FFmpeg |
| `Install-EbookScheduledTask` | Register Windows Scheduled Task for pipeline |
| `Uninstall-EbookScheduledTask` | Remove the scheduled task |
| `Get-EbookTaskStatus` | Check scheduled task state |
| `Initialize-EbookAutomation` | First-run setup wizard |
| `Write-EbookLog` | Timestamped logging to file + console |
| `Get-EbookConfig` | Load and cache settings.json |
| `Get-EbookMetadataFromFilename` | Parse title/author from ebook filenames |
| `Invoke-Balabolka` | TXT → WAV → MP3 pipeline via balcon.exe + ffmpeg |
| `Send-ToClaudeAPI` | General-purpose Anthropic Messages API wrapper |
| `Get-ChapterStructure` | Claude-assisted chapter/part detection from book text |
| `Test-EbookPipeline` | Run pdfminer HTML extraction regression test suite |
| `Test-ConversionQuality` | Visual QA on converted ebooks via Claude Vision API |

### pdf_to_balabolka.py — Modes

| Mode | Flag | Behavior |
|---|---|---|
| GUI | (no args) | Launches Tkinter GUI |
| Balabolka CLI | `--input book.pdf` | Extracts text from PDF/EPUB/MOBI/AZW/DJVU, strips front/back matter, ALL-CAPS chapter headings |
| Kindle CLI | `--input book.pdf --mode kindle` | Extracts text from PDF/EPUB/MOBI/AZW/DJVU, keeps full content, Markdown chapter headings for Calibre TOC |
| Kindle HTML | `--input book.pdf --mode kindle --html-extraction` | pdfminer font-metadata extraction → semantic HTML |
| Column-aware | `--force-columns` | Forces PyMuPDF column extraction regardless of detection confidence |

### Pipeline Architecture

Three extraction paths exist. Path selection happens inside `extract_text()` before any other logic:

**Auto-routing gate (in `extract_text()`):**
`detect_column_layout()` → if multi-column (confidence ≥ 60%): PyMuPDF path → else: pdfminer or pypdf path

1. **pdfminer (preferred, use `-UsePdfminer`):**
   `extract_with_pdfminer_html()` → `rejoin_html_fragments()` → `_fix_ligature_splits()` → `format_paragraphs_as_html()` → `_link_endnotes()`

2. **pypdf (legacy):**
   `extract_text()` → `clean_and_join()` → `fix_ocr_artifacts()` → AI rejoin → AI quality pass

3. **PyMuPDF column-aware (auto or `--force-columns`):**
   `detect_column_layout()` → `extract_text_columns()` → `clean_and_join()` → downstream unchanged
   Activated automatically when a PDF has ≥ 60% confidence of two-column layout (academic papers, commentaries).
   Use `--force-columns` / `-ForceColumns` to force this path regardless of detection confidence.

Changes to early phases cascade — always test downstream effects.

---

## External Dependencies

| Tool | Location | Purpose |
|---|---|---|
| Calibre (`ebook-convert.exe`) | `C:\Program Files\Calibre2\` | Ebook format conversion (KFX, AZW3, EPUB) |
| Calibre KFX Output plugin | Calibre plugins | Required for KFX output |
| Balabolka CLI (`balcon.exe`) | `tools\balcon\` | Text-to-speech engine |
| FFmpeg | PATH or `settings.json` | Audio/video encoding |
| Python 3.x | PATH | Script runtime |
| pypdf | pip package | PDF text extraction (MOBI/AZW/DJVU use Calibre intermediate) |
| ebooklib + BeautifulSoup | pip packages | Native EPUB text extraction |
| pymupdf | pip package | Two-column PDF layout detection and column-aware text extraction |
| Poppler (`pdftoppm`) | `tools\poppler\` | PDF page rendering (cover extraction + Visual QA) |
| pdf2image | pip package | Python wrapper for poppler page rendering |

---

## MCP Servers

MCP configuration lives in `.mcp.json` at the project root — **not** in `settings.json` or `.claude/settings.json`.

### Prerequisites

| Requirement | Status | Details |
|---|---|---|
| Node.js | Installed | v24.14.0 at `C:\Program Files\nodejs\node.exe` |
| npx | Installed | `C:\Program Files\nodejs\npx.cmd` (bundled with Node.js) |

No global npm packages required — both servers are fetched via `npx -y` on first use.

### Context7 (`@upstash/context7-mcp`)

**Status:** Configured and operational

Provides up-to-date library documentation and code examples. Use when working with any third-party library (Python packages, PowerShell modules, etc.) to get current API docs rather than relying on training-data approximations.

**Config in `.mcp.json`:**
```json
"context7": {
  "command": "C:\\Program Files\\nodejs\\npx.cmd",
  "args": ["-y", "@upstash/context7-mcp@latest"]
}
```

- Downloads `@upstash/context7-mcp@latest` on first use per session — no persistent install needed
- No API key required
- **Fallback if unavailable:** Use web search for library docs, or consult `EbookAutomation_Dependencies.md` for known package versions

### Atlassian MCP

**Status:** Configured (remote server — requires internet + OAuth)

Connects to Atlassian Cloud (Jira, Confluence) via the official hosted MCP endpoint.

**Config in `.mcp.json`:**
```json
"atlassian": {
  "type": "url",
  "url": "https://mcp.atlassian.com/v1/mcp"
}
```

- Remote server — no local install; requires active internet connection
- Authenticates via browser OAuth on first use each session
- Permission `mcp__claude_ai_Atlassian__*` pre-allowed in `.claude/settings.local.json`
- **Fallback if unavailable:** Update Jira tickets manually via browser; no local fallback script exists yet

---

## Common Mistakes to Avoid

- Don't use bash syntax in PowerShell
- Don't use `&` (bash AND operator) in PowerShell — use `;` or separate commands
- Don't use Unix-style pipes or redirections that don't exist in PowerShell
- Don't assume temp files still exist after a pipeline step — Windows may clean them up between steps
- Changes to regex phases affect downstream phases — test the full pipeline
- Ligature fixes can break endnote linking (paragraph text changes shift cluster detection)
- Heading classification changes can break Calibre (invalid TOC nesting)
- Don't stack multiple code fixes without running the test suite between each one
- Don't report "no regression" without actually running `test_pipeline.py`
- Don't retry failed MCP connections more than once — fall back to REST API immediately

---

## TTS Voice Configuration

Voices in use (Microsoft Online voices only — never use SAPI/offline voices):

| Voice | Role |
|---|---|
| Microsoft Steffan Online | Main narrator (default, no tags needed) |
| Microsoft Guy Online | Male forum posters / quote voice |
| Microsoft Aria Online | Female official statements, female tweeters |
| Microsoft Jenny Online | Warmer female / conversational |

**Never reference** Zira, Hazel, or any voice without "Online" in the name.

## Dependencies Reference

A full list of all external dependencies (Python packages, standalone tools, API services, TTS voices) is maintained in `EbookAutomation_Dependencies.md` at the project root. Consult this document before adding new dependencies, and update it whenever a dependency is added or removed.

---

## Visual QA System

Automated visual quality assurance for ebook conversions. Converts output files to paginated PDF via Calibre, renders sampled pages to PNG via pdf2image/poppler, sends them to the Claude Vision API for structured evaluation against a rubric.

### Pipeline Flow

KFX/AZW3 → Calibre → PDF → pdf2image/poppler → PNG pages → Claude Vision API → JSON report

### Components

| Component | Description |
|---|---|
| `tools/visual_qa.py` | Python script: Calibre PDF conversion → page sampling → PNG rendering → Claude Vision API → JSON report |
| `tools/visual_qa_rubric.md` | Rubric prompt template with 6 weighted evaluation categories |
| `Test-ConversionQuality` | PowerShell orchestrator (calls visual_qa.py, logs results) |
| `-ValidateVisual` switch | Available on `Convert-ToKindle` and `Invoke-EbookPipeline` |

### Rubric Categories

| Category | Weight | What's Checked |
|---|---|---|
| Text Integrity | 25% | Garbled characters, OCR debris, encoding artifacts |
| Heading Formatting | 20% | Visual distinction, consistent sizing, proper hierarchy |
| Paragraph Flow | 20% | Spacing, line breaks, indentation |
| TOC & Navigation | 15% | TOC present, entries match content, hierarchy correct |
| Cover & Images | 10% | Cover renders, images not distorted |
| Page Layout | 10% | Margins, text edges, blank space |

### Usage

```powershell
# Standalone
Test-ConversionQuality -InputFile "output\kindle\book.kfx"

# During conversion
Convert-ToKindle -InputFile "inbox\book.pdf" -ValidateVisual

# Full pipeline
Invoke-EbookPipeline -ValidateVisual
```

### Design Notes

- Images sent in batches of 5 to avoid API timeouts (300s timeout per batch)
- Smart page sampling: cover, TOC, chapter starts, random body pages, back matter (max 20 pages)
- Reports written as `_visual_qa_report.json` alongside the output file
- Warn-only — never blocks the pipeline, only logs results
- Cost: ~$0.20-0.35 per book depending on page count and image complexity

---

## Claude API Integration

The project uses the Anthropic Messages API for several AI-assisted features. The API key is stored as a permanent user environment variable (`ANTHROPIC_API_KEY`).

| Feature | Function/Script | Model | Purpose |
|---|---|---|---|
| Chapter detection | `Get-ChapterStructure` | claude-sonnet-4-6 | Detect chapter/part headings from extracted text |
| Text quality pass | `pdf_to_balabolka.py --api-key` | claude-sonnet-4-6 | Score extracted text and fix artifacts |
| Visual QA | `Test-ConversionQuality` / `visual_qa.py` | claude-sonnet-4-6 | Evaluate rendered page images against rubric |

### PowerShell API wrapper

```powershell
$response = Send-ToClaudeAPI -SystemPrompt "..." -UserMessage "..."
```

### Python API pattern

```python
response = requests.post(
    "https://api.anthropic.com/v1/messages",
    headers={"x-api-key": key, "content-type": "application/json", "anthropic-version": "2023-06-01"},
    json={"model": "claude-sonnet-4-6", "max_tokens": N, "system": "...", "messages": [...]},
    timeout=300,
)
```

---

## Book Metadata System

Centralized metadata capture, storage, and reapplication. Extracts metadata from source files (PDF internal metadata via PyMuPDF, EPUB OPF via ebooklib), merges with filename-derived metadata using a priority hierarchy, and stores in the pattern database.

### Metadata Priority (highest wins)

| Priority | Source | When |
|----------|--------|------|
| 5 | User override / Claude API | Explicit correction |
| 4 | Pattern database (existing entry) | Previously processed |
| 3 | EPUB OPF metadata | EPUB files |
| 2 | PDF internal metadata | PDF files |
| 1 | Filename parser (`Get-EbookMetadataFromFilename`) | Always |

### Database Table

`book_metadata` in `tools/data/ebook_patterns.db` — stores merged metadata per book, keyed on `title_hash`.

### CLI Commands

```bash
python tools/pattern_db.py extract-metadata --file "book.pdf" --output-file meta.json
python tools/pattern_db.py get-metadata --title-hash "abc123" --output-file meta.json
python tools/pattern_db.py update-metadata --title-hash "abc123" --title "Title" --source-type filename_parser
python tools/pattern_db.py store-metadata --metadata-file meta.json
```

### Pipeline Integration

- `Convert-ToKindle`: Extracts + merges metadata before text extraction. Merged values feed Calibre `--title`/`--authors`/etc. flags.
- `Convert-ToTTS`: Extracts + stores metadata (database population only, no reapplication to TXT).
- `Send-ToKindle` (email): Looks up metadata, passes `--metadata-file` to `email_to_kindle.py` which injects metadata into PDFs with empty internal metadata.

All metadata capture is non-blocking — failures log a warning and fall back to filename-only parsing.

---

## Kindle Email Delivery

Send converted ebooks to Kindle via Amazon's Send-to-Kindle email service.

### Environment Variable

`EBOOK_SMTP_PASSWORD` — Gmail App Password for SMTP authentication. Set as a permanent user environment variable (same pattern as `ANTHROPIC_API_KEY`). The env var name is configurable via `kindle_delivery.email.smtp_app_password_env` in settings.json.

### Config (settings.json)

```json
"kindle_delivery": {
    "email": {
        "kindle_address": "user_XXXX@kindle.com",
        "smtp_server": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "user@gmail.com",
        "smtp_app_password_env": "EBOOK_SMTP_PASSWORD",
        "convert_subject": true,
        "max_email_size_mb": 50
    }
}
```

### Supported Email Formats

Amazon accepts: PDF, EPUB, DOC, DOCX, TXT, RTF, HTM, HTML, image files. KFX and MOBI are **not** accepted via email.

### EPUB Intermediate Files

When `-ProduceEpub` or `-EmailToKindle` is active, `Convert-ToKindle` saves:
- `output\kindle\BookName.epub` — the EPUB for email delivery
- `output\kindle\.intermediates\BookName_kindle.html` — preserved HTML for future EPUB regeneration

The `.intermediates\` directory is hidden on Windows.

### Usage

```powershell
Send-ToKindle -InputFile "book.epub" -Email                    # email EPUB
Send-ToKindle -InputFile "book.pdf" -Email -EmailFormat PDF    # email PDF
Send-ToKindle -InputFile "book.pdf" -Email -Compress           # compress before email
Invoke-EbookPipeline -EmailToKindle                            # email after conversion
Invoke-EbookPipeline -SendToKindle -EmailToKindle              # USB + email
```

---

## FOH Daily Brief Generation

When generating FOH daily briefs from JSON data:
- Follow `FOH_Brief_Prompt_Template_v1_2.md` for format and voice tags
- Output `.txt` files with Balabolka SSML voice tags, ready to load directly
- Check the username pronunciation map and add new entries for unknown handles
- Word count targets vary by window size — refer to the length targets table

---

## Things to Avoid

- **Don't suggest cloud TTS** (Azure, ElevenLabs, etc.) unless specifically asked — local Balabolka workflow is intentional
- **Don't restructure `settings.json` schema** without discussion
- **Don't add Python dependencies** without calling them out — no `requirements.txt` yet, manual installs
- **Don't recommend rewriting** working components in a different language/framework without clear reason
- **Don't hardcode absolute paths** — everything goes through `settings.json`
- **Don't overwrite MCP config files** (e.g., `.mcp.json`) — always merge new entries into the existing object, never replace the entire file

---

## Git Workflow

**Repo:** `jlfowler1084/EbookAutomation` (private)
**Branch:** `master` (default working branch)
**Remote:** `origin` → GitHub

### Standard workflow for all code changes:

1. **Pull before starting work:** `git pull origin master` to ensure you're on the latest
2. **Make changes** — edit files as needed
3. **Stage and commit** with a descriptive message:
   ```
   git add -A
   git commit -m "feat: description of what changed"
   ```
4. **Push to remote:** `git push origin master`

### Commit message conventions:

- `feat:` — new feature or capability
- `fix:` — bug fix
- `refactor:` — code restructuring, no behavior change
- `docs:` — documentation updates (CLAUDE.md, user manual, comments)
- `chore:` — maintenance (dependencies, config, cleanup)
- `test:` — adding or updating tests

### Rules:

- **Every task that modifies project files should end with a commit and push.** Don't leave uncommitted changes.
- **Never commit** files matching `.gitignore` patterns: `archive/`, `inbox/`, `output/`, `processing/`, `logs/`, `debug/`, `tools/balcon/`, `tools/poppler/`, ebook/audio file formats, credentials, or `.claude/settings.local.json`
- If a task involves multiple logical changes, use **separate commits** for each (e.g., one for the code change, one for the doc update)
- Before starting any work session, run `git status` to check for uncommitted changes from previous sessions

---

## Current Priorities

See `EbookAutomation_ProjectTracker.md` for the full backlog. Active items:
1. Visual QA Phase 3 — Rubric tuning from pattern data, auto-fix loop for known fixable issues
2. Heading duplication bug — Styled headings duplicated as garbled OCR text in body paragraphs (found by VQA on scanned PDFs)
3. Wire `-UseClaudeChapters` into Kindle path (Task 10)
4. Improve `clean_and_join()` heading preservation (Task 9)
5. Add full comment-based help to all PowerShell functions (Task 3a)
6. Complete the inbox-to-MP3 pipeline (Task 4a)
