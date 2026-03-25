# CareerPilot API Call Registry

This file documents every outbound API call in the project. Updated by Claude Code whenever a call is added or modified. Run the cost audit prompt periodically to verify this stays accurate.

**Last audited:** 2026-03-25

## Dashboard (Next.js)

| Route / Function | Service | Model | Purpose | Trigger | Cost/Call | Justification |
|---|---|---|---|---|---|---|
| `/api/search-indeed` | Anthropic + Indeed MCP | Haiku (env var) | Search Indeed job listings via Claude MCP relay | User clicks Run Search | ~$0.01-0.02 | Indeed MCP requires Claude proxy (`/claude/` path). Downgraded to Haiku (SCRUM-154). Auth added (SCRUM-156) |
| `/api/search-dice` | Anthropic + Dice MCP | Haiku (env var) | Search Dice job listings via Claude MCP relay | User clicks Run Search | ~$0.01-0.02 | Dice MCP endpoint is standard HTTP but building a full MCP client isn't worth $3.60/mo savings. Downgraded to Haiku (SCRUM-154). Auth added (SCRUM-156) |
| `/api/gmail/classify` | Anthropic | Haiku (env var) | Categorize email into 7 categories + extract metadata | Email scan pipeline (auto on inbox load) | ~$0.001 | Downgraded to Haiku (SCRUM-154 P3) — simple classification |
| `/api/conversations` POST | Anthropic | Haiku (env var) | Extract 3-7 topic tags from conversation notes | User logs a conversation | ~$0.0008 | Downgraded to Haiku (SCRUM-154 P3) — simple extraction |
| `/api/conversations/[id]` PATCH | Anthropic | Haiku (env var) | Re-extract topic tags when notes change | User edits conversation | ~$0.0008 | Downgraded to Haiku (SCRUM-154 P3) — same as above |
| `/api/conversations/patterns` | Anthropic | Sonnet (env var) | Analyze patterns across all conversations | User views patterns page | ~$0.02-0.06 | Justified: cross-conversation reasoning. **Add caching** |
| `/api/interview-prep` | Anthropic | Sonnet (env var) + web_search | Generate stage-specific interview prep material | User clicks Generate Prep | ~$0.08-0.15 | Justified: complex generation + web search |
| `/api/interview-prep/debrief` | Supabase | — | Store debrief and create conversation record | User submits debrief | $0.00 | No AI needed |
| `/api/gmail/scan` | Gmail API | — | Paginated inbox scan for new emails | Auto on page load (15-min cooldown) | $0.00 | Direct Google API |
| `/api/gmail/message` | Gmail API | — | Fetch full email body by Gmail ID | During classification | $0.00 | Direct Google API |
| `/api/gmail/thread` | Gmail API | — | Fetch full conversation thread | User clicks email to expand | $0.00 | Direct Google API |

## Python CLI (src/)

| Route / Function | Service | Model | Purpose | Trigger | Cost/Call | Justification |
|---|---|---|---|---|---|---|
| `src/gmail/scanner.py:257` | Anthropic SDK | Sonnet (hardcoded) | Classify inbox email into categories | `cli.py scan` — per email | ~$0.004 | **Downgrade to Haiku** — simple classification |
| `src/gmail/responder.py:117` | Anthropic SDK | Sonnet (hardcoded) | Draft personalized email response | User selects response mode | ~$0.01 | Justified: quality matters for outgoing email |
| `src/gmail/thread_actions.py:99` | Anthropic SDK | Sonnet (hardcoded) | Draft contextual reply within thread | User selects reply mode | ~$0.01 | Justified: nuanced generation |
| `src/gmail/thread_actions.py:224` | Anthropic SDK | Sonnet (hardcoded) | Draft scheduling reply with availability | User selects scheduling mode | ~$0.01 | Justified: needs calendar context weaving |
| `src/jobs/analyzer.py:80` | Anthropic SDK | Sonnet (hardcoded) | Score job description fit against resume | Manual CLI | ~$0.03 | Justified: multi-factor analysis |
| `src/jobs/searcher.py:116` | Anthropic SDK + Dice MCP | Sonnet (hardcoded) | Search Dice via Claude MCP relay | `cli.py search` | ~$0.05 | **VIOLATION: Claude as MCP relay** |
| `src/documents/resume_generator.py:195` | Anthropic SDK | Sonnet (hardcoded) | Tailor resume for specific job | Manual CLI | ~$0.06 | Justified: creative rewriting |
| `src/documents/cover_letter_generator.py:128` | Anthropic SDK | Sonnet (hardcoded) | Generate tailored cover letter | Manual CLI | ~$0.04 | Justified: creative writing |
| `src/journal/entries.py:92` | Anthropic SDK | Sonnet (hardcoded) | Auto-tag journal entry (3-5 tags) | Creating new journal entry | ~$0.003 | **Downgrade to Haiku** — simple extraction |
| `src/journal/insights.py:62` | Anthropic SDK | Sonnet (hardcoded) | Weekly journal summary with action items | `cli.py journal insights` | ~$0.02 | Justified: cross-entry synthesis |
| `src/journal/insights.py:96` | Anthropic SDK | Sonnet (hardcoded) | Momentum check (4-category assessment) | `cli.py journal insights` | ~$0.005 | **Downgrade to Haiku** — simple classification |
| `src/skills/roadmap.py:68` | Anthropic SDK | Sonnet (hardcoded) | Generate week-by-week study plan | `cli.py roadmap` | ~$0.06 | Justified: complex planning |
| `src/interviews/coach.py:174` | Anthropic SDK | Sonnet (hardcoded) | Analyze full interview transcript | `cli.py interview analyze` | ~$0.08 | Justified: deep analysis |
| `src/interviews/coach.py:236` | Anthropic SDK | Sonnet (hardcoded) | Compare multiple interview analyses | `cli.py interview compare` | ~$0.04 | Justified: cross-interview synthesis |
| `src/interviews/coach.py:297` | Anthropic SDK | Haiku (env var) | Generate mock interview question (x5) | `cli.py interview mock` | ~$0.001 x5 | Downgraded to Haiku (SCRUM-154 P3) — question gen is simple |
| `src/interviews/coach.py:326` | Anthropic SDK | Sonnet (env var) | Evaluate mock answer (x5) | `cli.py interview mock` | ~$0.01 x5 | Justified: evaluation requires reasoning |
| `src/interviews/coach.py:373` | Anthropic SDK | Sonnet (env var) | Final mock assessment | End of mock session | ~$0.03 | Justified: comprehensive assessment |
| `src/interviews/transcripts.py:229` | Anthropic SDK | Sonnet (hardcoded) | Label speakers in unparseable transcripts | Transcript load fallback | ~$0.06 | Justified: NLP speaker diarization (rare) |
| `src/profile/manager.py:181` | Anthropic SDK | Sonnet (hardcoded) | Parse resume into structured profile JSON | Manual CLI (one-time) | ~$0.06 | Justified: one-time complex extraction |

## Standalone Scripts

| Route / Function | Service | Model | Purpose | Trigger | Cost/Call | Justification |
|---|---|---|---|---|---|---|
| `scanner/career_page_scraper.py:333` | Anthropic + web_search | Sonnet (hardcoded) | Scrape company career pages for IT roles | Manual scan (~21+ calls/run) | ~$0.10/call, $2-4/run | **Cache 24hr** — most expensive single operation |

## Google APIs (not AI-metered)

| Route / Function | Service | Purpose | Trigger |
|---|---|---|---|
| `src/gmail/scanner.py:103` | Gmail `messages.list` | Search inbox for recruiter emails | `cli.py scan` |
| `src/gmail/scanner.py:162` | Gmail `messages.get` | Fetch full email details | Per email found |
| `src/gmail/responder.py:185` | Gmail `drafts.create` | Save response as Gmail draft | User approves draft |
| `src/calendar/scheduler.py:87` | Calendar `events.list` | Check available time slots | Booking reply workflow |

<!-- Add new entries above this line -->
