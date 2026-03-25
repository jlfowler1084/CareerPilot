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
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8080")
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

# --- Timezone ---
TIMEZONE = os.getenv("TIMEZONE", "America/Indiana/Indianapolis")

# --- OAuth Token Paths ---
GMAIL_TOKEN_PATH = PROJECT_ROOT / "data" / "gmail_token.json"
GMAIL_FILTER_TOKEN_PATH = PROJECT_ROOT / "data" / "gmail_filter_token.json"
CALENDAR_TOKEN_PATH = PROJECT_ROOT / "data" / "calendar_token.json"

# --- Data Directories ---
DATA_DIR = PROJECT_ROOT / "data"
JOURNAL_DIR = DATA_DIR / "journal"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"
