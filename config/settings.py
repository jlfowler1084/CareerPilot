"""Central configuration — loads .env and exposes all config values as module-level constants."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Project root is one level up from config/
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load .env from project root
load_dotenv(PROJECT_ROOT / ".env")

# Reconfigure stdout/stderr for UTF-8 on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# --- API Keys ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# --- Google OAuth ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost")
GOOGLE_CREDENTIALS_FILE = PROJECT_ROOT / "config" / "google_credentials.json"

# --- Google API Scopes ---
GMAIL_SCOPES = os.getenv(
    "GMAIL_SCOPES", "https://www.googleapis.com/auth/gmail.modify"
).split(",")
CALENDAR_SCOPES = os.getenv(
    "CALENDAR_SCOPES", "https://www.googleapis.com/auth/calendar"
).split(",")

# --- Claude Model Selection (API Cost Governance) ---
MODEL_HAIKU = os.getenv("MODEL_HAIKU", "claude-haiku-4-5-20251001")
MODEL_SONNET = os.getenv("MODEL_SONNET", "claude-sonnet-4-6")

# --- Database ---
DB_PATH = Path(os.getenv("DB_PATH", str(PROJECT_ROOT / "data" / "careerpilot.db")))

# --- Supabase (CAR-164) ---
# CLI writes to the same Supabase project as the dashboard. Auth strategy (c.1):
# service-role key stored in .env, bypassing RLS. Acceptable for a single-user
# local tool; never expose this key to a browser. See src/db/supabase_client.py
# for the full rationale and docs/brainstorms/CAR-163-application-entry-paths-
# consolidation-audit.md §3 for the alternatives considered.
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# CAR-165: user_id that owns CLI-created rows (service-role key bypasses RLS,
# so inserts must specify user_id explicitly). Paste from dashboard → Auth → Users.
CAREERPILOT_USER_ID = os.getenv("CAREERPILOT_USER_ID", "")

# --- Timezone ---
TIMEZONE = os.getenv("TIMEZONE", "America/Indiana/Indianapolis")

# --- OAuth Token Paths ---
GMAIL_TOKEN_PATH = PROJECT_ROOT / "data" / "gmail_token.json"
GMAIL_FILTER_TOKEN_PATH = PROJECT_ROOT / "data" / "gmail_filter_token.json"
CALENDAR_TOKEN_PATH = PROJECT_ROOT / "data" / "calendar_token.json"

# --- OAuth Token Monitor (CAR-196) ---
# Daily watchdog that alerts Discord when GMAIL_TOKEN_PATH goes stale or dies.
# 7-day default mirrors the pre-CAR-194 Testing-mode refresh expiry: anything
# older than that is unusual even with Production publishing in place.
OAUTH_MONITOR_STALE_DAYS = int(os.getenv("OAUTH_MONITOR_STALE_DAYS", "7"))
OAUTH_MONITOR_SUPPRESS_HOURS = int(os.getenv("OAUTH_MONITOR_SUPPRESS_HOURS", "24"))
OAUTH_MONITOR_CHANNEL = os.getenv("OAUTH_MONITOR_CHANNEL", "careerpilot-updates")
OAUTH_MONITOR_STATE_PATH = PROJECT_ROOT / "data" / "oauth_monitor_state.json"

# --- Data Directories ---
DATA_DIR = PROJECT_ROOT / "data"
JOURNAL_DIR = DATA_DIR / "journal"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"

# ---------------------------------------------------------------------------
# Local LLM Router — environment variables (CAR-142)
# ---------------------------------------------------------------------------

LLM_LOCAL_BASE_URL = os.getenv("CAREERPILOT_LLM_LOCAL_BASE_URL", "")
LLM_LOCAL_MODEL_CHAT = os.getenv("CAREERPILOT_LLM_LOCAL_MODEL_CHAT", "")
# Embeddings run on a separate vLLM instance (different port) — see .env.example.
LLM_LOCAL_EMBED_BASE_URL = os.getenv("CAREERPILOT_LLM_LOCAL_EMBED_BASE_URL", "")
LLM_LOCAL_MODEL_EMBED = os.getenv(
    "CAREERPILOT_LLM_LOCAL_MODEL_EMBED", "Qwen/Qwen3-Embedding-8B"
)
LLM_LOCAL_API_KEY = os.getenv("CAREERPILOT_LLM_LOCAL_API_KEY", "")
LLM_KILL_SWITCH = (
    os.getenv("LLM_ROUTING_KILL_SWITCH", os.getenv("CAREERPILOT_LLM_KILL_SWITCH", "0")) == "1"
)
LLM_FALLBACK_BUDGET_PER_DAY = int(
    os.getenv("CAREERPILOT_LLM_FALLBACK_BUDGET_PER_DAY", "50")
)

# ---------------------------------------------------------------------------
# Task model map — Claude-side default model per task (CAR-142)
# ---------------------------------------------------------------------------

TASK_MODEL_MAP = {
    # R9 structured-local tier — routes to Qwen by default (Unit 3+)
    "email_classify":       "local",
    "job_analyze":          "local",
    "skill_extract":        "local",
    "company_intel":        "local",
    "profile_extract":      "local",
    "gmail_thread_actions": "local",
    # R10 Claude-default tier — stays on Claude; includes skill_study_plan (web_search constraint)
    "skill_study_plan":     MODEL_SONNET,
    "roadmap_generate":     MODEL_SONNET,
    "journal_entry":        MODEL_HAIKU,
    "journal_weekly_summary": MODEL_SONNET,
    "journal_momentum":     MODEL_HAIKU,
    "transcript_speaker_id": MODEL_SONNET,
    "recruiter_respond":    MODEL_SONNET,
    "interview_transcript_analyze": MODEL_SONNET,
    "interview_compare":    MODEL_SONNET,
    "interview_question_gen": MODEL_HAIKU,
    "interview_answer_eval":  MODEL_SONNET,
    "interview_summary":    MODEL_SONNET,
    "resume_generate":      MODEL_SONNET,
    "cover_letter":         MODEL_SONNET,
    "daily_summary":        MODEL_SONNET,
}

# ---------------------------------------------------------------------------
# Task config — per-task parameters, system prompts, JSON schemas (CAR-142)
# ---------------------------------------------------------------------------
# Keys: system_prompt (str), max_tokens (int), fallback_policy (str), schema (dict|None)
# fallback_policy "allow"  — route to Claude on local failure without prompting
# fallback_policy "prompt" — ask user before sending to Claude (PII-bearing tasks)

TASK_CONFIG = {
    # ------------------------------------------------------------------
    # R9 structured-local tier
    # ------------------------------------------------------------------
    "email_classify": {
        "system_prompt": (
            "You are an email classifier for a job seeker. "
            "Classify this email into exactly one category. "
            "Respond with JSON only, no markdown fences, no preamble: "
            '{"category": "recruiter_outreach|job_alert|rejection|interview_request|offer|irrelevant", '
            '"company": "...", "role": "...", "urgency": "low|medium|high", '
            '"summary": "one sentence"}'
        ),
        "max_tokens": 256,
        "fallback_policy": "prompt",
        "schema": {
            "type": "object",
            "required": ["category", "company", "role", "urgency", "summary"],
            "properties": {
                "category": {
                    "type": "string",
                    "enum": [
                        "recruiter_outreach",
                        "job_alert",
                        "rejection",
                        "interview_request",
                        "offer",
                        "irrelevant",
                    ],
                },
                "company": {"type": "string"},
                "role": {"type": "string"},
                "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
                "summary": {"type": "string"},
            },
            "additionalProperties": False,
        },
    },
    "job_analyze": {
        "system_prompt": (
            "You are a career advisor analyzing job fit. Compare the job description against "
            "the candidate's resume/skills and return a JSON object with exactly these keys:\n\n"
            "{\n"
            '  "match_score": 7,\n'
            '  "matching_skills": ["skill 1", "skill 2"],\n'
            '  "gap_skills": ["skill the job wants that the candidate lacks"],\n'
            '  "resume_tweaks": ["specific bullet points to emphasize for this application"],\n'
            '  "red_flags": ["anything suspicious about the posting"]\n'
            "}\n\n"
            "match_score is 1-10. Return ONLY valid JSON, no markdown fences, no commentary."
        ),
        "max_tokens": 2048,
        "fallback_policy": "allow",
        "schema": {
            "type": "object",
            "required": ["match_score", "matching_skills", "gap_skills", "resume_tweaks", "red_flags"],
            "properties": {
                "match_score": {"type": "integer", "minimum": 1, "maximum": 10},
                "matching_skills": {"type": "array", "items": {"type": "string"}},
                "gap_skills": {"type": "array", "items": {"type": "string"}},
                "resume_tweaks": {"type": "array", "items": {"type": "string"}},
                "red_flags": {"type": "array", "items": {"type": "string"}},
            },
            "additionalProperties": False,
        },
    },
    "skill_extract": {
        "system_prompt": (
            "You are a technical recruiter parsing a job description. Extract ALL technical "
            "skills, tools, platforms, and certifications mentioned. Return a JSON array.\n\n"
            'For each skill, classify as "required" (must-have, listed under requirements/'
            'qualifications) or "preferred" (nice-to-have, listed under preferred/bonus) or '
            '"mentioned" (referenced but not explicitly required).\n\n'
            "Normalize skill names: use canonical names (e.g., \"Kubernetes\" not \"K8s\", "
            '"PowerShell" not "PS", "Active Directory" not "AD"). Merge duplicates.\n\n'
            "Categorize each skill: cloud, scripting, networking, security, os, monitoring, "
            "devops, database, soft_skill, other.\n\n"
            "Return ONLY valid JSON, no markdown fences, no commentary:\n"
            "[\n"
            '  {"skill": "Terraform", "category": "devops", "level": "required"},\n'
            '  {"skill": "Python", "category": "scripting", "level": "preferred"}\n'
            "]"
        ),
        "max_tokens": 2048,
        "fallback_policy": "allow",
        "schema": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["skill", "category", "level"],
                "properties": {
                    "skill": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "cloud", "scripting", "networking", "security", "os",
                            "monitoring", "devops", "database", "soft_skill", "other",
                        ],
                    },
                    "level": {
                        "type": "string",
                        "enum": ["required", "preferred", "mentioned"],
                    },
                },
            },
        },
    },
    "skill_study_plan": {
        "system_prompt": (
            "You are a practical career development advisor for an IT infrastructure "
            "professional in Indianapolis transitioning toward cloud/DevOps roles.\n\n"
            "Given these skill gaps (skills the job market demands but the candidate lacks "
            "or is weak in), create a prioritized study plan. Use web_search to find "
            "CURRENT, working resource links.\n\n"
            "Rules:\n"
            "- Prioritize by job market demand (higher times_seen = higher priority)\n"
            "- Prefer free resources: Microsoft Learn, HashiCorp Learn, official docs, YouTube\n"
            "- Include realistic time estimates (hours to reach conversational competency)\n"
            "- Be concise and practical\n\n"
            "Return ONLY valid JSON, no markdown fences:\n"
            "[\n"
            "  {\n"
            '    "skill": "Terraform",\n'
            '    "priority": 1,\n'
            '    "target_hours": 8,\n'
            '    "resources": [\n'
            '      {"title": "HashiCorp Learn: Get Started", '
            '"url": "https://learn.hashicorp.com/terraform", "type": "course"}\n'
            "    ],\n"
            '    "rationale": "Mentioned in 6/12 jobs, 5 as required."\n'
            "  }\n"
            "]"
        ),
        "max_tokens": 4096,
        "fallback_policy": "allow",
        "schema": None,  # prose output — router returns raw string; caller parses JSON
        "claude_extra": {
            "tools": [{"type": "web_search_20250305", "name": "web_search"}],
        },
    },
    "company_intel": {
        "system_prompt": (
            "You are a company research analyst preparing an intelligence brief for a job "
            "seeker targeting IT infrastructure / systems engineering roles. Use web_search "
            "to research the company thoroughly, then return a single JSON object.\n\n"
            "IMPORTANT: Return ONLY valid JSON, no markdown fences, no commentary outside the JSON.\n\n"
            "Required sections (always include):\n\n"
            "{\n"
            '  "company_overview": {\n'
            '    "description": "What they do, industry, mission",\n'
            '    "headquarters": "City, State",\n'
            '    "size": "Employee count range",\n'
            '    "revenue_or_funding": "Revenue or funding info",\n'
            '    "key_products": ["product1", "product2"],\n'
            '    "recent_news": [{"headline": "...", "date": "YYYY-MM", "summary": "..."}]\n'
            "  },\n"
            '  "culture": {\n'
            '    "glassdoor_rating": "X.X/5 or \'Not found\'",\n'
            '    "sentiment_summary": "Overall employee sentiment",\n'
            '    "work_life_balance": "Summary",\n'
            '    "remote_policy": "Remote/hybrid/onsite details",\n'
            '    "pros": ["pro1", "pro2"],\n'
            '    "cons": ["con1", "con2"]\n'
            "  },\n"
            '  "it_intelligence": {\n'
            '    "tech_stack": ["technology1", "technology2"],\n'
            '    "cloud_provider": "Primary cloud provider(s)",\n'
            '    "infrastructure_scale": "Scale description",\n'
            '    "recent_it_postings": [{"title": "Job Title", "signal": "What this hiring signals"}],\n'
            '    "it_challenges": ["challenge1"]\n'
            "  },\n"
            '  "generated_at": "ISO 8601 timestamp",\n'
            '  "sources": ["url1", "url2"]\n'
            "}\n"
        ),
        "max_tokens": 8192,
        "fallback_policy": "prompt",
        "schema": {
            "type": "object",
            "required": [
                "company_overview", "culture", "it_intelligence", "generated_at", "sources",
            ],
            "properties": {
                "company_overview": {"type": "object"},
                "culture": {"type": "object"},
                "it_intelligence": {"type": "object"},
                "role_analysis": {"type": "object"},
                "interviewer_prep": {"type": "object"},
                "generated_at": {"type": "string"},
                "sources": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
    "profile_extract": {
        "system_prompt": (
            "You are a resume parser. Extract structured profile data from the "
            "resume text and return ONLY valid JSON with no markdown formatting. "
            "Use this exact schema:\n"
            "{\n"
            '  "personal": {"full_name": "", "email": "", "phone": "", '
            '"street": "", "city": "", "state": "", "zip": "", '
            '"linkedin_url": "", "github_url": "", "website": ""},\n'
            '  "work_history": [{"company": "", "title": "", "location": "", '
            '"start_date": "", "end_date": null, "description": "", "is_current": false}],\n'
            '  "education": [{"school": "", "degree": "", "field_of_study": "", '
            '"graduation_date": "", "gpa": null}],\n'
            '  "certifications": [{"name": "", "issuer": "", "date_obtained": "", '
            '"expiry_date": null, "in_progress": false}]\n'
            "}\n"
            "For dates, use YYYY-MM format. For end_date, use null if current position. "
            "Set is_current=true for the most recent position if end_date is recent or blank."
        ),
        "max_tokens": 4096,
        "fallback_policy": "prompt",
        "schema": {
            "type": "object",
            "required": ["personal", "work_history", "education", "certifications"],
            "properties": {
                "personal": {"type": "object"},
                "work_history": {"type": "array"},
                "education": {"type": "array"},
                "certifications": {"type": "array"},
            },
        },
    },
    "gmail_thread_actions": {
        "system_prompt": (
            "You are a professional reply writer for a job seeker. "
            "Write a reply based on the full conversation thread below. "
            "Rules:\n"
            "- This is a reply in an ongoing conversation, not a cold email\n"
            "- Professional but warm tone\n"
            "- Be concise\n"
            "- NEVER oversell or fabricate experience\n"
            "- NEVER use markdown formatting — write plain email text only\n"
            "- Do not include a subject line — just the body\n"
            "- Sign off with the candidate's first name only"
        ),
        "max_tokens": 512,
        "fallback_policy": "allow",
        "schema": None,
    },
    # ------------------------------------------------------------------
    # R10 Claude-default tier
    # ------------------------------------------------------------------
    "roadmap_generate": {
        "system_prompt": (
            "You are a practical career development advisor for an IT infrastructure "
            "professional transitioning toward cloud/DevOps roles. "
            "Create a specific, actionable study roadmap. "
            "Rules:\n"
            "- Prioritize by job market demand for Indianapolis/remote roles\n"
            "- Prefer free resources: Microsoft Learn, official docs, YouTube channels, GitHub repos\n"
            "- Include one hands-on project per skill that builds toward a portfolio\n"
            "- Give realistic time estimates\n"
            "- Be concise and practical, not motivational\n"
            "- Format with clear headers per skill"
        ),
        "max_tokens": 4096,
        "fallback_policy": "allow",
        "schema": None,
    },
    "journal_entry": {
        "system_prompt": (
            "You are a tagging assistant. Given journal entry content, generate 3-5 "
            "short, relevant tags. Respond with a JSON array of strings only, "
            'no markdown fences, no explanation. Example: ["python", "debugging", "api"]'
        ),
        "max_tokens": 128,
        "fallback_policy": "allow",
        "schema": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": 5,
        },
    },
    "journal_weekly_summary": {
        "system_prompt": (
            "You are a practical career coach reviewing a job seeker's weekly journal entries. "
            "Be direct and specific. No motivational fluff. "
            "Respond in plain text with these sections:\n"
            "WHAT WENT WELL:\n"
            "NEEDS ATTENTION:\n"
            "SKILL GAPS IDENTIFIED:\n"
            "FOCUS FOR NEXT WEEK:\n"
        ),
        "max_tokens": 1024,
        "fallback_policy": "allow",
        "schema": None,
    },
    "journal_momentum": {
        "system_prompt": (
            "You are analyzing a job seeker's journal entries over the past 2 weeks. "
            "Look at entry frequency, content depth, and tone. "
            "Respond with ONLY one of these statuses on the first line: "
            "strong, steady, slipping, stalled\n"
            "Then a 1-2 sentence explanation. No motivational speeches."
        ),
        "max_tokens": 256,
        "fallback_policy": "allow",
        "schema": None,
    },
    "transcript_speaker_id": {
        "system_prompt": (
            "Identify and label the speakers in this interview transcript. "
            "Label the interviewer as 'Interviewer' and the candidate as 'Candidate'. "
            "Return the transcript with clear speaker labels on each turn, formatted as:\n"
            "Interviewer: <text>\nCandidate: <text>\n\n"
            "Return ONLY the relabeled transcript, no commentary."
        ),
        "max_tokens": 4096,
        "fallback_policy": "allow",
        "schema": None,
    },
    "recruiter_respond": {
        "system_prompt": (
            "You are a professional reply writer for a job seeker. "
            "Write a reply email based on the instructions below. "
            "Rules:\n"
            "- Professional but warm tone — not a corporate robot\n"
            "- Be concise\n"
            "- NEVER oversell or fabricate experience\n"
            "- NEVER use markdown formatting — write plain email text only\n"
            "- Do not include a subject line — just the body\n"
            "- Sign off with the candidate's first name only"
        ),
        "max_tokens": 512,
        "fallback_policy": "allow",
        "schema": None,
    },
    "interview_transcript_analyze": {
        "system_prompt": (
            "You are an expert interview coach. Analyze this interview transcript and return "
            "a JSON object with exactly these keys:\n\n"
            "{\n"
            '  "questions_asked": ["list of every distinct question the interviewer asked"],\n'
            '  "response_quality": [\n'
            "    {\n"
            '      "question": "the question",\n'
            '      "summary": "what the candidate said (brief)",\n'
            '      "rating": 3,\n'
            '      "strengths": "what was strong",\n'
            '      "weaknesses": "what was weak"\n'
            "    }\n"
            "  ],\n"
            '  "technical_gaps": ["technologies or concepts the candidate couldn\'t answer"],\n'
            '  "behavioral_assessment": {\n'
            '    "star_usage": "assessment of STAR format usage",\n'
            '    "communication_clarity": "assessment",\n'
            '    "enthusiasm": "assessment",\n'
            '    "confidence": "assessment"\n'
            "  },\n"
            '  "overall_score": 7,\n'
            '  "overall_justification": "brief justification for the score",\n'
            '  "top_improvements": ["improvement 1", "improvement 2", "improvement 3"],\n'
            '  "practice_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]\n'
            "}\n\n"
            "Ratings are 1-5 per question, overall_score is 1-10.\n"
            "Return ONLY valid JSON, no markdown fences, no commentary."
        ),
        "max_tokens": 4096,
        "fallback_policy": "allow",
        "schema": {
            "type": "object",
            "required": [
                "questions_asked", "response_quality", "technical_gaps",
                "behavioral_assessment", "overall_score", "overall_justification",
                "top_improvements", "practice_questions",
            ],
            "properties": {
                "questions_asked": {"type": "array", "items": {"type": "string"}},
                "response_quality": {"type": "array"},
                "technical_gaps": {"type": "array", "items": {"type": "string"}},
                "behavioral_assessment": {"type": "object"},
                "overall_score": {"type": "integer", "minimum": 1, "maximum": 10},
                "overall_justification": {"type": "string"},
                "top_improvements": {"type": "array", "items": {"type": "string"}},
                "practice_questions": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
    "interview_compare": {
        "system_prompt": (
            "You are an expert interview coach reviewing multiple interview analyses over time.\n"
            "Analyze the patterns and return a JSON object with exactly these keys:\n\n"
            "{\n"
            '  "recurring_weak_topics": ["topics that appear as gaps across multiple interviews"],\n'
            '  "improved_skills": ["skills that show improvement over time"],\n'
            '  "persistent_gaps": ["gaps that remain unfixed and need focused study"],\n'
            '  "trajectory": "improving|plateauing|declining",\n'
            '  "trajectory_explanation": "brief explanation of the trajectory assessment",\n'
            '  "recommendations": ["top 3 actionable recommendations"]\n'
            "}\n\n"
            "Return ONLY valid JSON, no markdown fences, no commentary."
        ),
        "max_tokens": 2048,
        "fallback_policy": "allow",
        "schema": {
            "type": "object",
            "required": [
                "recurring_weak_topics", "improved_skills", "persistent_gaps",
                "trajectory", "trajectory_explanation", "recommendations",
            ],
            "properties": {
                "recurring_weak_topics": {"type": "array", "items": {"type": "string"}},
                "improved_skills": {"type": "array", "items": {"type": "string"}},
                "persistent_gaps": {"type": "array", "items": {"type": "string"}},
                "trajectory": {
                    "type": "string",
                    "enum": ["improving", "plateauing", "declining"],
                },
                "trajectory_explanation": {"type": "string"},
                "recommendations": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
    # interview_question_gen / _answer_eval / _summary: the MOCK_*_PROMPT constants
    # are format-string USER MESSAGE TEMPLATES, not system prompts. system_prompt = "".
    "interview_question_gen": {
        "system_prompt": "",
        "max_tokens": 512,
        "fallback_policy": "allow",
        "schema": None,
    },
    "interview_answer_eval": {
        "system_prompt": "",
        "max_tokens": 1024,
        "fallback_policy": "allow",
        "schema": {
            "type": "object",
            "required": ["rating", "strengths", "weaknesses", "ideal_answer_points"],
            "properties": {
                "rating": {"type": "integer", "minimum": 1, "maximum": 5},
                "strengths": {"type": "string"},
                "weaknesses": {"type": "string"},
                "ideal_answer_points": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
    "interview_summary": {
        "system_prompt": "",
        "max_tokens": 2048,
        "fallback_policy": "allow",
        "schema": {
            "type": "object",
            "required": [
                "overall_score", "overall_justification", "top_improvements",
                "practice_questions", "technical_gaps",
            ],
            "properties": {
                "overall_score": {"type": "integer", "minimum": 1, "maximum": 10},
                "overall_justification": {"type": "string"},
                "top_improvements": {"type": "array", "items": {"type": "string"}},
                "practice_questions": {"type": "array", "items": {"type": "string"}},
                "technical_gaps": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
    "resume_generate": {
        "system_prompt": (
            "You are a resume optimization expert. Given a base resume and a target job "
            "description, produce a tailored version. Rules:\n"
            "- NEVER fabricate experience or add skills the candidate doesn't have.\n"
            "- ONLY reorder bullets to put the most relevant first.\n"
            "- Adjust the Professional Summary to emphasize what this job cares about.\n"
            "- Naturally weave in keywords from the job description into existing bullet "
            "points where they genuinely apply.\n"
            "- Return the result as JSON matching the exact input structure "
            "(professional_summary, core_skills, experience, education, certifications, "
            "technical_knowledge).\n"
            "- Return ONLY valid JSON, no markdown fences, no commentary."
        ),
        "max_tokens": 4096,
        "fallback_policy": "allow",
        "schema": {
            "type": "object",
            "required": [
                "professional_summary", "core_skills", "experience",
                "education", "certifications", "technical_knowledge",
            ],
            "properties": {
                "professional_summary": {"type": "string"},
                "core_skills": {},
                "experience": {"type": "array"},
                "education": {"type": "array"},
                "certifications": {"type": "array"},
                "technical_knowledge": {},
            },
        },
    },
    "cover_letter": {
        "system_prompt": (
            "You are a cover letter writer for a senior IT professional. Write a compelling, "
            "specific cover letter. Rules:\n"
            "- 3-4 paragraphs.\n"
            "- First paragraph: express interest in the specific role at the specific company.\n"
            "- Second paragraph: highlight 2-3 specific experiences from the candidate's "
            "background that directly match what the job requires.\n"
            "- Third paragraph: address any skill gaps honestly as growth opportunities.\n"
            "- Final paragraph: express enthusiasm, mention availability, invite next steps.\n"
            "- Tone: professional but genuine — sounds like a real person, not a template.\n"
            "- NEVER make up experience. NEVER be generic.\n"
            "- Return ONLY the cover letter text, no markdown formatting, no extra commentary."
        ),
        "max_tokens": 2048,
        "fallback_policy": "allow",
        "schema": None,
    },
    # daily_summary: cli.py sends only a user message, no system prompt
    "daily_summary": {
        "system_prompt": "",
        "max_tokens": 512,
        "fallback_policy": "allow",
        "schema": None,
    },
    # ------------------------------------------------------------------
    # Embedding task — local provider only; no Claude fallback
    # ------------------------------------------------------------------
    "embed_default": {
        "system_prompt": "",
        "max_tokens": 0,
        "fallback_policy": "allow",
        "schema": None,
    },
}
