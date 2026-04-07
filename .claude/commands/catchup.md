# /catchup — Cross-Project Context Summary

**This command SCANS multiple data sources and PRODUCES an original summary. The dependency
registry is an INPUT — do not display it. The output is the structured summary populated
with data gathered from the steps below.**

## Data Gathering

Use `Get-SBCrossProjectActivity` to gather session and commit data. Do NOT use raw `find`
or `cat` — they produce inconsistent results and duplicate module logic.

### Step 1: Auto-create daily note stub

Run this PowerShell block FIRST to ensure today's daily note exists:

```powershell
$today = Get-Date -Format 'yyyy-MM-dd'
$dailyNote = "F:\Obsidian\SecondBrain\Daily Notes\$today.md"
if (-not (Test-Path $dailyNote)) {
    $dayName = (Get-Date).ToString('dddd')
    $stub = @"
---
date: $today
tags: [daily]
created_by: catchup-auto-stub
---

# $today, $dayName

## Active Context
- Working on:
- Open questions:

## Cross-Project Signals
<!-- Add NEW DEPENDENCY: markers here when you discover cross-project dependencies -->

## Tasks
- [ ]

## Notes

## Connections
"@
    New-Item -Path $dailyNote -ItemType File -Value $stub -Force | Out-Null
    Write-Host "Created daily note stub: $dailyNote" -ForegroundColor Green
}
```

### Step 2: Load cross-project activity

```powershell
Import-Module 'F:\Obsidian\SecondBrain\Resources\SB-PSModules\SecondBrain.psd1' -ErrorAction SilentlyContinue
$activity = Get-SBCrossProjectActivity -DaysBack 2
```

### Step 3: Read dependency registry

Read `F:\Obsidian\SecondBrain\Resources\project-dependencies.json` and find all
dependencies where CareerPilot is either `from` or `to`.

### Step 4: Read today's daily note for dependency flags

Read `F:\Obsidian\SecondBrain\Daily Notes\<YYYY-MM-DD>.md` and look for lines
containing `NEW DEPENDENCY:` markers. Collect them for the Flagged Dependencies section.

### Step 5: Identify cross-project ticket references

From the `$activity` objects, collect all `CrossProjectRefs` arrays. Look for ticket IDs
matching other projects' Jira keys (CAR-\d+, INFRA-\d+, SCRUM-\d+, EB-\d+, HOME-\d+)
that reference work outside the current project.

## Output Format

Produce the following structured summary with these EXACT section headers IN THIS ORDER:

```markdown
# Cross-Project Context for CareerPilot

## Dependencies
- <project>: <type> — <summary>
(list all dependencies where CareerPilot is from or to)

## Flagged Dependencies
<NEW DEPENDENCY: markers found in today's daily note; otherwise "None found">

## Recent Activity in Dependent Projects (last 48h)

### <DependentProject>
- Sessions: <count> sessions
- Commits today: <count>
- Key changes: <summary of notable changes>

### <DependentProject>
- Sessions: <count> sessions
- Commits today: <count>
- Key changes: <summary of notable changes>

(repeat for each dependent project; if no activity, state "No activity in last 48 hours")

## Open items that may affect us
- <items from session logs that reference CareerPilot or shared interfaces>
(if none found, state "None identified")

## Recent Activity in CareerPilot (last 48h)
- Sessions: <count>
- Commits today: <count>
- Key changes: <summary>

## Cross-Project References Detected
- <ticket> referenced in <project> commits/sessions — <brief context>
(if none, state "No cross-project references detected")

## Action Items for This Session
- <actionable items based on findings>
(if nothing actionable, state "No immediate action items")

<!-- BEGIN CATCHUP METADATA
catchup_version: 1.0
project: CareerPilot
generated_at: <ISO 8601 timestamp>
days_back: 2
dependent_projects:
  - <name>
cross_project_refs:
  - <ticket-id>
new_dependencies: []
flagged_risks: []
END CATCHUP METADATA -->
```

If no recent activity is found for a dependent project, state "No activity in last 48 hours"
rather than omitting the project or generating filler content.
