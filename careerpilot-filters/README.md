# CareerPilot — Gmail Smart Filters

Auto-route job search emails into organized labels. Part of the CareerPilot job search automation suite.

**Jira:** SCRUM-104

## What It Does

Creates a label hierarchy in Gmail and sets up automatic filters to sort incoming job search emails:

```
CareerPilot/
├── Recruiters         ← TEKsystems, Robert Half, Kforce, staffing agencies
├── Job Alerts         ← Indeed, Dice, LinkedIn, Glassdoor, ZipRecruiter
├── Interviews         ← Phone screens, technical assessments, scheduling
├── Applications       ← "Thank you for applying" confirmations
└── Offers-Rejections  ← Status updates, offers, rejections
```

Filters also retroactively tag existing messages in your inbox.

## Quick Start

### 1. Google Cloud Setup (one-time, ~5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "CareerPilot")
3. Enable the **Gmail API**: [Direct link](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name: "CareerPilot"
6. Download the JSON file and save it as `credentials.json` in this directory
7. Go to **OAuth consent screen** → Add yourself as a test user

### 2. Install & Run

```bash
pip install -r requirements.txt
python cli.py filters setup
```

First run will open a browser window for Google OAuth consent. After that, your token is cached locally.

## CLI Commands

| Command | Description |
|---------|-------------|
| `python cli.py filters setup` | Create labels + filters + tag existing mail |
| `python cli.py filters list` | Show current filter rules |
| `python cli.py filters add <domain>` | Add a recruiter domain to the filter |
| `python cli.py filters remove <domain>` | Remove a recruiter domain |
| `python cli.py filters test` | Dry-run: show queries without API calls |
| `python cli.py filters nuke` | Remove all CareerPilot filters |

## Adding New Recruiter Domains

When you get an email from a new recruiter or staffing agency:

```bash
python cli.py filters add newagency.com
python cli.py filters setup   # re-apply to Gmail
```

User-added domains are stored in `user_recruiter_domains.txt` and merged with the built-in list on each setup run.

## Customizing Filter Rules

Edit `careerpilot/filter_config.py` to:
- Add sender addresses to any filter rule
- Add subject line patterns
- Change which label a rule routes to
- Set `"archive": True` to skip the inbox for noisy senders

## Files

```
careerpilot-filters/
├── cli.py                              # CLI entry point
├── credentials.json                    # YOUR OAuth credentials (not committed)
├── token.json                          # Cached auth token (auto-generated)
├── user_recruiter_domains.txt          # User-added domains (auto-managed)
├── requirements.txt                    # Python dependencies
├── README.md                           # This file
└── careerpilot/
    ├── __init__.py
    ├── filter_config.py                # Label hierarchy + filter rules
    └── gmail_client.py                 # Gmail API wrapper
```

## Security Notes

- `credentials.json` and `token.json` contain sensitive auth data — do **not** commit them
- The app only requests `gmail.labels` and `gmail.settings.basic` scopes (no read/send access)
- All processing happens locally; no data leaves your machine
