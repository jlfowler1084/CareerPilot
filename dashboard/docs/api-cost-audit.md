# CareerPilot API Cost Audit

**Date:** 2026-03-25
**Scope:** Full codebase — `dashboard/src/`, `dashboard/supabase/`, `src/`, `scanner/`, `cli.py`, `config/`
**Auditor:** Claude Code (automated scan + manual verification)

---

## Executive Summary

- **Total metered API call sites found:** 28
  - Dashboard (Next.js): 7 Anthropic + 3 Google Gmail
  - Python backend: 17 Anthropic + 3 Google Gmail + 2 Google Calendar
  - Career page scraper: 1 Anthropic (with web_search)
- **Hardcoded model strings:** 26 locations across the codebase (none use env vars)
- **Missing auth checks:** 2 dashboard routes (`search-indeed`, `search-dice`)
- **Page-load triggers:** 2 (email auto-scan + orphan classification on inbox mount)

---

## Dashboard (Next.js) API Call Sites

| # | File | Route/Function | Target Service | Model | Max Tokens | Purpose | Trigger | Est. Cost/Call | AI Necessary? | Recommended Action | Reasoning |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [classify/route.ts:56](dashboard/src/app/api/gmail/classify/route.ts#L56) | `POST /api/gmail/classify` | Anthropic Messages API | `claude-sonnet-4-6` | 300 | Classify email into 7 categories + extract metadata (company, role, urgency) | Auto on inbox page load (orphans) + after scan; batched 10/s, max 3 retries | ~$0.005 (input ~500 tok + output ~200 tok) | **Partial** — category detection is simple but metadata extraction benefits from AI | DOWNGRADE TO HAIKU | Category classification is pattern matching; Haiku handles structured extraction at 1/4 cost. Input is short (3KB max). |
| 2 | [interview-prep/route.ts:76](dashboard/src/app/api/interview-prep/route.ts#L76) | `POST /api/interview-prep` | Anthropic Messages API + `web_search_20250305` tool | `claude-sonnet-4-6` | 4096 | Generate stage-specific interview prep (phone screen/interview/offer) with live web search | User clicks "Generate prep" button | ~$0.08–0.15 (large prompt + web search + 4K output) | **Yes** — requires reasoning about job context, web search synthesis, structured output | KEEP AS-IS | High-value, user-initiated, benefits from Sonnet's reasoning. Web search adds real-time company data. |
| 3 | [patterns/route.ts:52](dashboard/src/app/api/conversations/patterns/route.ts#L52) | `GET /api/conversations/patterns` | Anthropic Messages API | `claude-sonnet-4-20250514` | 2000 | Analyze all conversations for recurring questions, strong/weak topics, weekly summary | Page load on Conversations tab OR manual "Analyze" click | ~$0.02–0.06 (varies with conversation count) | **Yes** — cross-conversation pattern analysis requires reasoning | CACHE/REDUCE FREQUENCY | Results don't change until new conversations are added. Cache for 1 hour or until conversation count changes. |
| 4 | [conversations/route.ts:9](dashboard/src/app/api/conversations/route.ts#L9) | `POST /api/conversations` (extractTopics helper) | Anthropic Messages API | `claude-sonnet-4-20250514` | 300 | Extract 3–7 topic tags from conversation notes | When creating conversation with notes (conditional: only if no topics provided) | ~$0.003 (short input/output) | **Partial** — topic extraction is low-complexity NLP | DOWNGRADE TO HAIKU | Simple keyword extraction. Haiku is sufficient and 4x cheaper. |
| 5 | [conversations/[id]/route.ts:9](dashboard/src/app/api/conversations/[id]/route.ts#L9) | `PATCH /api/conversations/[id]` (extractTopics helper) | Anthropic Messages API | `claude-sonnet-4-20250514` | 300 | Re-extract topics when notes change | When updating conversation with changed notes (conditional) | ~$0.003 | **Partial** — same as #4 | DOWNGRADE TO HAIKU | Same reasoning as #4. |
| 6 | [search-indeed/route.ts:15](dashboard/src/app/api/search-indeed/route.ts#L15) | `POST /api/search-indeed` | Anthropic Messages API + Indeed MCP (`mcp.indeed.com`) | `claude-sonnet-4-6` | 4000 | Search Indeed job board via MCP server | User clicks "Search" button | ~$0.04–0.08 (MCP tool call + result parsing) | **No** — Claude is only used as MCP transport layer, not for reasoning | REPLACE WITH DIRECT MCP | Claude adds no reasoning value here. Direct MCP call would eliminate AI cost entirely. |
| 7 | [search-dice/route.ts:19](dashboard/src/app/api/search-dice/route.ts#L19) | `POST /api/search-dice` | Anthropic Messages API + Dice MCP (`mcp.dice.com`) | `claude-sonnet-4-6` | 4000 | Search Dice job board via MCP server | User clicks "Search" button | ~$0.04–0.08 (MCP tool call + result parsing) | **No** — same as #6 | REPLACE WITH DIRECT MCP | Same reasoning as #6. Claude is just a pass-through. |
| 8 | [gmail/scan/route.ts:25](dashboard/src/app/api/gmail/scan/route.ts#L25) | `POST /api/gmail/scan` | Google Gmail API (`messages.list` + `messages.get`) | N/A | N/A | Paginated inbox scan for new emails | Auto on page load (15-min cooldown) + manual "Scan" button | Free tier (Gmail API quota) | N/A | KEEP AS-IS | Google API — no AI cost. Cooldown already in place. |
| 9 | [gmail/message/route.ts](dashboard/src/app/api/gmail/message/route.ts) | `POST /api/gmail/message` | Google Gmail API (`messages.get`) | N/A | N/A | Fetch full email body by Gmail ID | During classification (for each email to classify) | Free tier | N/A | KEEP AS-IS | Required for classification input. |
| 10 | [gmail/thread/route.ts:31](dashboard/src/app/api/gmail/thread/route.ts#L31) | `POST /api/gmail/thread` | Google Gmail API (`threads.get`) | N/A | N/A | Fetch full conversation thread | User clicks email to expand detail view | Free tier | N/A | KEEP AS-IS | On-demand, user-initiated. |

---

## Python Backend API Call Sites

| # | File | Function | Target Service | Model | Max Tokens | Purpose | Trigger | Est. Cost/Call | AI Necessary? | Recommended Action | Reasoning |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 11 | [scanner.py:257](src/gmail/scanner.py#L257) | `GmailScanner.classify_email()` | Anthropic SDK | `claude-sonnet-4-6` | 256 | Classify inbox email into categories | `cli.py scan` — per email | ~$0.004 | **Partial** | DOWNGRADE TO HAIKU | Same as dashboard #1 — simple classification. |
| 12 | [responder.py:117](src/gmail/responder.py#L117) | `RecruiterResponder.draft_response()` | Anthropic SDK | `claude-sonnet-4-6` | 512 | Generate personalized email response (interested/not_interested/more_info) | User selects response mode during scan | ~$0.01 | **Yes** — personalized response needs reasoning | KEEP AS-IS | Quality matters for outgoing email. Low frequency. |
| 13 | [thread_actions.py:99](src/gmail/thread_actions.py#L99) | `ThreadActions.draft_thread_reply()` | Anthropic SDK | `claude-sonnet-4-6` | 512 | Draft contextual reply within email thread | User selects reply mode | ~$0.01 | **Yes** | KEEP AS-IS | Same reasoning as #12. |
| 14 | [thread_actions.py:224](src/gmail/thread_actions.py#L224) | `ThreadActions.draft_booking_reply()` | Anthropic SDK | `claude-sonnet-4-6` | 512 | Draft scheduling reply with availability | User selects scheduling mode | ~$0.01 | **Yes** | KEEP AS-IS | Needs to weave in calendar availability. |
| 15 | [analyzer.py:80](src/jobs/analyzer.py#L80) | `JobAnalyzer.analyze_fit()` | Anthropic SDK | `claude-sonnet-4-6` | 2048 | Score job description fit against resume | Manual CLI command | ~$0.03 | **Yes** — multi-factor analysis | KEEP AS-IS | High-value reasoning task. |
| 16 | [resume_generator.py:195](src/documents/resume_generator.py#L195) | `ResumeGenerator.tailor_resume()` | Anthropic SDK | `claude-sonnet-4-6` | 4096 | Tailor resume for specific job description | Manual CLI command | ~$0.06 | **Yes** — creative rewriting | KEEP AS-IS | High quality output required. |
| 17 | [cover_letter_generator.py:128](src/documents/cover_letter_generator.py#L128) | `CoverLetterGenerator.generate_cover_letter()` | Anthropic SDK | `claude-sonnet-4-6` | 2048 | Generate tailored cover letter | Manual CLI command | ~$0.04 | **Yes** — creative writing | KEEP AS-IS | Quality directly impacts applications. |
| 18 | [insights.py:62](src/journal/insights.py#L62) | `InsightsEngine.weekly_summary()` | Anthropic SDK | `claude-sonnet-4-6` | 1024 | Weekly journal summary with action items | `cli.py journal insights` | ~$0.02 | **Yes** — synthesis across entries | KEEP AS-IS | Sonnet reasoning needed. Low frequency (weekly). |
| 19 | [insights.py:96](src/journal/insights.py#L96) | `InsightsEngine.momentum_check()` | Anthropic SDK | `claude-sonnet-4-6` | 256 | Assess search momentum (strong/steady/slipping/stalled) | `cli.py journal insights` | ~$0.005 | **Partial** — could be rules-based with entry frequency | DOWNGRADE TO HAIKU | Momentum is largely frequency + sentiment. Haiku sufficient. |
| 20 | [entries.py:92](src/journal/entries.py#L92) | `JournalEntries._auto_tag()` | Anthropic SDK | `claude-sonnet-4-6` | 128 | Auto-generate 3–5 tags for journal entry | When creating new journal entry | ~$0.003 | **Partial** — simple keyword extraction | DOWNGRADE TO HAIKU | Same as dashboard topic extraction. |
| 21 | [roadmap.py:68](src/skills/roadmap.py#L68) | `RoadmapGenerator.generate_roadmap()` | Anthropic SDK | `claude-sonnet-4-6` | 4096 | Generate week-by-week study plan for skill gaps | `cli.py roadmap` | ~$0.06 | **Yes** — complex planning | KEEP AS-IS | High-value output. Low frequency. |
| 22 | [coach.py:174](src/interviews/coach.py#L174) | `InterviewCoach.analyze_interview()` | Anthropic SDK | `claude-sonnet-4-6` | 4096 | Analyze full interview transcript | `cli.py interview analyze <file>` | ~$0.08 | **Yes** — deep analysis | KEEP AS-IS | Core feature. Transcript analysis requires strong reasoning. |
| 23 | [coach.py:236](src/interviews/coach.py#L236) | `InterviewCoach.compare_interviews()` | Anthropic SDK | `claude-sonnet-4-6` | 2048 | Compare multiple interview analyses for trends | `cli.py interview compare` | ~$0.04 | **Yes** — cross-interview synthesis | KEEP AS-IS | Low frequency, high value. |
| 24 | [coach.py:296](src/interviews/coach.py#L296) | `InterviewCoach.mock_interview()` (question gen, x5) | Anthropic SDK | `claude-sonnet-4-6` | 512 | Generate interview question (5 sequential calls per session) | `cli.py interview mock` | ~$0.005 x5 = $0.025/session | **Partial** — questions could be pre-generated or use Haiku | DOWNGRADE TO HAIKU | Question generation doesn't need Sonnet reasoning. |
| 25 | [coach.py:325](src/interviews/coach.py#L325) | `InterviewCoach.mock_interview()` (answer eval, x5) | Anthropic SDK | `claude-sonnet-4-6` | 1024 | Evaluate candidate answer (5 sequential calls per session) | `cli.py interview mock` | ~$0.01 x5 = $0.05/session | **Yes** — evaluation requires reasoning | KEEP AS-IS | Quality feedback requires strong model. |
| 26 | [coach.py:372](src/interviews/coach.py#L372) | `InterviewCoach.mock_interview()` (final assessment) | Anthropic SDK | `claude-sonnet-4-6` | 2048 | Final mock interview assessment | End of `cli.py interview mock` session | ~$0.03 | **Yes** — comprehensive assessment | KEEP AS-IS | Synthesis across full mock session. |
| 27 | [transcripts.py:229](src/interviews/transcripts.py#L229) | `TranscriptStore._claude_identify_speakers()` | Anthropic SDK | `claude-sonnet-4-6` | 4096 | Label speakers in unparseable transcripts | When loading transcript with unidentifiable speakers | ~$0.06 | **Yes** — NLP speaker diarization | KEEP AS-IS | Fallback only — rarely triggered. |
| 28 | [manager.py:181](src/profile/manager.py#L181) | `ProfileManager.import_from_resume()` | Anthropic SDK | `claude-sonnet-4-6` | 4096 | Parse resume text into structured profile JSON | Manual CLI command (one-time) | ~$0.06 | **Yes** — complex extraction | KEEP AS-IS | One-time operation. High accuracy needed. |

---

## Standalone Scripts

| # | File | Function | Target Service | Model | Max Tokens | Purpose | Trigger | Est. Cost/Call | AI Necessary? | Recommended Action | Reasoning |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | [career_page_scraper.py:333](scanner/career_page_scraper.py#L333) | `scan_company()` | Anthropic REST API + `web_search_20250305` | `claude-sonnet-4-20250514` | 4000 | Scrape company career pages for IT roles via web search | `career_page_scraper.py scan` — 1 call per search query per company (~3–4 queries × 7+ companies) | ~$0.08–0.15/call, **~$2–4 per full scan** | **Yes** — web search + job listing extraction | CACHE/REDUCE FREQUENCY | Most expensive operation. Cache results for 24h. Skip companies with no changes. |

---

## Google API Call Sites (Not AI-metered, but quota-limited)

| # | File | Function | Service | Purpose | Trigger |
|---|---|---|---|---|---|
| G1 | [scanner.py:103](src/gmail/scanner.py#L103) | `GmailScanner.scan_inbox()` | Gmail `messages.list` | Search inbox for recruiter emails | `cli.py scan` |
| G2 | [scanner.py:162](src/gmail/scanner.py#L162) | `GmailScanner.get_email_details()` | Gmail `messages.get` | Fetch full email (headers + body) | Per email found in scan |
| G3 | [responder.py:185](src/gmail/responder.py#L185) | `RecruiterResponder.save_draft()` | Gmail `drafts.create` | Save response as Gmail draft | User approves draft |
| G4 | [responder.py:236](src/gmail/responder.py#L236) | `RecruiterResponder.send_response()` | Gmail `messages.send` | Send email (explicit approval required) | User clicks send |
| G5 | [scheduler.py:87](src/calendar/scheduler.py#L87) | `CalendarScheduler.get_availability()` | Calendar `events.list` | Check available time slots | During booking reply workflow |

---

## Anti-Pattern Findings

### 1. Hardcoded Model Strings (26 locations)

All model strings are hardcoded. None use environment variables.

**Dashboard (7 locations):**
- `dashboard/src/app/api/gmail/classify/route.ts:64` — `"claude-sonnet-4-6"`
- `dashboard/src/app/api/interview-prep/route.ts:84` — `"claude-sonnet-4-6"`
- `dashboard/src/app/api/search-indeed/route.ts:24` — `"claude-sonnet-4-6"`
- `dashboard/src/app/api/search-dice/route.ts:28` — `"claude-sonnet-4-6"`
- `dashboard/src/app/api/conversations/patterns/route.ts:60` — `"claude-sonnet-4-20250514"`
- `dashboard/src/app/api/conversations/route.ts:17` — `"claude-sonnet-4-20250514"`
- `dashboard/src/app/api/conversations/[id]/route.ts:17` — `"claude-sonnet-4-20250514"`

**Python backend (18 locations):**
- `src/gmail/scanner.py:257`, `src/gmail/responder.py:117`, `src/gmail/thread_actions.py:99,224`
- `src/jobs/analyzer.py:80`, `src/jobs/searcher.py:116`
- `src/documents/resume_generator.py:195`, `src/documents/cover_letter_generator.py:128`
- `src/journal/entries.py:92`, `src/journal/insights.py:62,96`
- `src/skills/roadmap.py:68`, `src/interviews/coach.py:174,236,296,325,372`
- `src/interviews/transcripts.py:229`, `src/profile/manager.py:181`

**Scraper (1 location):**
- `scanner/career_page_scraper.py:43` — `"claude-sonnet-4-20250514"`

**Inconsistency noted:** Dashboard uses two different model versions — `claude-sonnet-4-6` (4 routes) and `claude-sonnet-4-20250514` (3 routes). The Python backend uses `claude-sonnet-4-6` everywhere.

### 2. Missing Auth Checks

- [search-indeed/route.ts](dashboard/src/app/api/search-indeed/route.ts) — **No Supabase auth check.** Anyone can call this route and trigger Anthropic + MCP costs.
- [search-dice/route.ts](dashboard/src/app/api/search-dice/route.ts) — **No Supabase auth check.** Same issue.

### 3. Page-Load / Auto-Fire Triggers

- **Inbox auto-scan** ([use-emails.ts:62-67](dashboard/src/hooks/use-emails.ts#L62)): Fires on mount. Has 15-min cooldown, but first visit always triggers a Gmail scan.
- **Orphan classification** ([use-emails.ts:69-74](dashboard/src/hooks/use-emails.ts#L69)): If any emails have category `"unclassified"`, auto-classifies them on page load. Each email = 1 Claude API call.
- **Conversation patterns** ([use-conversations.ts:106](dashboard/src/hooks/use-conversations.ts#L106)): The `fetchPatterns` function is exposed but NOT auto-called on mount (good — it's manual). However, a component could call it on mount.

### 4. Batch Consolidation Opportunities

- **Email classification** (#1): Currently calls Claude once per email sequentially with 1s batch delays. Could batch 5–10 emails into a single prompt to reduce per-call overhead and token waste from repeated system prompts.
- **Mock interview questions** (#24): 5 sequential Claude calls for question generation. Could batch into 1 call requesting 5 questions.
- **Career page scraper** (S1): Makes 3–4 web_search calls per company. Could consolidate queries into fewer, broader searches.

### 5. Missing Error Handling / Retry Risks

- All dashboard routes have try/catch error handling (good).
- Email classification has a max 3 retry cap per email (good — prevents runaway costs).
- Career page scraper has basic timeout handling but no retry cap visible at the function level.
- Indeed/Dice routes return 200 with empty results on catch — prevents client-side retries (good).

---

## Cost Estimates

### Current Daily Cost (Single User, Active Job Search)

| Category | Calls/Day | Avg Cost/Call | Daily Cost |
|---|---|---|---|
| Email classification (dashboard) | 10–20 | $0.005 | $0.05–0.10 |
| Indeed/Dice search (2 sources × 2 searches) | 4 | $0.06 | $0.24 |
| Interview prep generation | 0–1 | $0.12 | $0.00–0.12 |
| Conversation patterns | 1 | $0.04 | $0.04 |
| Topic extraction | 2 | $0.003 | $0.006 |
| Career page scraper (full scan) | 0–1 runs (21+ calls) | $0.10 | $0.00–2.10 |
| Python CLI misc (journal, mock, etc.) | 2 | $0.03 | $0.06 |
| **Total estimated daily** | | | **$0.40–2.70** |

### Projected Daily Cost After Optimizations

| Optimization | Current | After | Savings |
|---|---|---|---|
| Downgrade email classify to Haiku | $0.10 | $0.025 | $0.075/day |
| Replace Indeed/Dice with direct MCP | $0.24 | $0.00 | $0.24/day |
| Cache conversation patterns (1hr) | $0.04 | $0.01 | $0.03/day |
| Downgrade topic extraction to Haiku | $0.006 | $0.0015 | $0.0045/day |
| Downgrade mock question gen to Haiku | $0.025 | $0.006 | $0.019/day |
| Cache career scraper (24hr) | $2.10 | $0.30 | $1.80/day |
| Batch email classification | $0.10 | $0.04 | $0.06/day |
| **Total optimized daily** | **$2.70 max** | **$0.50 max** | **~$2.20/day (81% reduction)** |

---

## Priority Implementation Plan

Ordered by estimated savings (highest first):

| Priority | Action | Files to Change | Est. Savings | Effort |
|---|---|---|---|---|
| **P0** | **Add auth to search routes** | `search-indeed/route.ts`, `search-dice/route.ts` | Prevents abuse (unbounded cost) | 10 min |
| **P1** | **Replace Indeed/Dice with direct MCP calls** | `search-indeed/route.ts`, `search-dice/route.ts` | $0.24/day ($7.20/mo) | 2–4 hr |
| **P2** | **Cache career scraper results (24hr dedup)** | `scanner/career_page_scraper.py` | $1.80/day ($54/mo) | 1 hr |
| **P3** | **Centralize model strings as env vars** | All 26 files listed above | Enables instant model switching | 1–2 hr |
| **P4** | **Downgrade email classify to Haiku** | `classify/route.ts`, `scanner.py` | $0.075/day ($2.25/mo) | 15 min |
| **P5** | **Batch email classification (5–10 per call)** | `classify/route.ts`, `use-emails.ts` | $0.06/day ($1.80/mo) | 1–2 hr |
| **P6** | **Cache conversation patterns** | `patterns/route.ts` + add cache table | $0.03/day ($0.90/mo) | 1 hr |
| **P7** | **Downgrade topic extraction to Haiku** | `conversations/route.ts`, `conversations/[id]/route.ts`, `entries.py` | $0.005/day ($0.15/mo) | 15 min |
| **P8** | **Downgrade mock question gen to Haiku** | `coach.py:296` | $0.019/day ($0.57/mo) | 10 min |
| **P9** | **Batch mock interview questions** | `coach.py` (consolidate 5 calls → 1) | ~$0.02/session | 30 min |
| **P10** | **Standardize model versions** | 3 dashboard routes using `4-20250514` vs `4-6` | Consistency | 10 min |

---

## Model String Centralization Proposal

### Dashboard (`dashboard/.env.local`)
```env
CLAUDE_MODEL_REASONING=claude-sonnet-4-6       # For interview prep, response drafting
CLAUDE_MODEL_CLASSIFY=claude-haiku-4-5-20251001 # For classification, topic extraction
```

### Python Backend (`.env` / `config/settings.py`)
```python
CLAUDE_MODEL_REASONING = os.getenv("CLAUDE_MODEL_REASONING", "claude-sonnet-4-6")
CLAUDE_MODEL_CLASSIFY = os.getenv("CLAUDE_MODEL_CLASSIFY", "claude-haiku-4-5-20251001")
```

This allows switching models without code changes and enables different tiers for different task types.
