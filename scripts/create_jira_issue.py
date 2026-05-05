"""One-shot Jira issue creator used as MCP fallback.

Reads description (markdown) from a file path passed via --body-file,
converts to ADF (Atlassian Document Format), and POSTs to Jira v3 API.

Usage:
    python scripts/create_jira_issue.py \
        --project CAR \
        --type Task \
        --summary "..." \
        --body-file path/to/description.md
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

JIRA_SITE = "jlfowler1084.atlassian.net"


def _inline_marks(text: str) -> list[dict]:
    """Convert a single line of markdown inline formatting to ADF text nodes.

    Handles: `code`, **bold**. Plain text otherwise. Order matters: code first
    so that backticks containing asterisks don't get re-parsed.
    """
    nodes: list[dict] = []
    pattern = re.compile(r"(`[^`]+`|\*\*[^*]+\*\*)")
    pos = 0
    for m in pattern.finditer(text):
        if m.start() > pos:
            nodes.append({"type": "text", "text": text[pos : m.start()]})
        token = m.group(0)
        if token.startswith("`"):
            nodes.append(
                {
                    "type": "text",
                    "text": token[1:-1],
                    "marks": [{"type": "code"}],
                }
            )
        else:
            nodes.append(
                {
                    "type": "text",
                    "text": token[2:-2],
                    "marks": [{"type": "strong"}],
                }
            )
        pos = m.end()
    if pos < len(text):
        nodes.append({"type": "text", "text": text[pos:]})
    return nodes or [{"type": "text", "text": ""}]


def markdown_to_adf(md: str) -> dict:
    """Tiny markdown subset → ADF doc.

    Supports: # H1 … ###### H6, paragraphs (blank-line separated), bullet
    lists (`- ` or `* `), ordered lists (`N. `), inline `code` and **bold**.
    Falls back to paragraphs for anything else.
    """
    lines = md.splitlines()
    blocks: list[dict] = []
    i = 0
    n = len(lines)

    def flush_paragraph(buf: list[str]) -> None:
        if not buf:
            return
        text = " ".join(s.strip() for s in buf).strip()
        if text:
            blocks.append({"type": "paragraph", "content": _inline_marks(text)})

    para_buf: list[str] = []

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_paragraph(para_buf)
            para_buf = []
            i += 1
            continue

        h = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if h:
            flush_paragraph(para_buf)
            para_buf = []
            level = len(h.group(1))
            blocks.append(
                {
                    "type": "heading",
                    "attrs": {"level": level},
                    "content": _inline_marks(h.group(2)),
                }
            )
            i += 1
            continue

        if re.match(r"^[-*]\s+", stripped):
            flush_paragraph(para_buf)
            para_buf = []
            items: list[dict] = []
            while i < n and re.match(r"^[-*]\s+", lines[i].strip()):
                item_text = re.sub(r"^[-*]\s+", "", lines[i].strip())
                # Continuation lines (indented) join the same item.
                i += 1
                while i < n and lines[i].startswith(("  ", "\t")) and lines[i].strip():
                    item_text += " " + lines[i].strip()
                    i += 1
                items.append(
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": _inline_marks(item_text),
                            }
                        ],
                    }
                )
            blocks.append({"type": "bulletList", "content": items})
            continue

        if re.match(r"^\d+\.\s+", stripped):
            flush_paragraph(para_buf)
            para_buf = []
            items = []
            while i < n and re.match(r"^\d+\.\s+", lines[i].strip()):
                item_text = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                i += 1
                while i < n and lines[i].startswith(("  ", "\t")) and lines[i].strip():
                    item_text += " " + lines[i].strip()
                    i += 1
                items.append(
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": _inline_marks(item_text),
                            }
                        ],
                    }
                )
            blocks.append({"type": "orderedList", "content": items})
            continue

        para_buf.append(stripped)
        i += 1

    flush_paragraph(para_buf)

    return {"type": "doc", "version": 1, "content": blocks}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--project", required=True)
    p.add_argument("--type", required=True, dest="issue_type")
    p.add_argument("--summary", required=True)
    p.add_argument("--body-file", required=True, type=Path)
    args = p.parse_args()

    email = os.environ.get("JIRA_EMAIL")
    token = os.environ.get("JIRA_API_TOKEN") or os.environ.get("ATLASSIAN_API_TOKEN")
    if not email or not token:
        print("ERROR: JIRA_EMAIL and JIRA_API_TOKEN must be set in env", file=sys.stderr)
        return 2

    md = args.body_file.read_text(encoding="utf-8")
    description = markdown_to_adf(md)

    payload = {
        "fields": {
            "project": {"key": args.project},
            "issuetype": {"name": args.issue_type},
            "summary": args.summary,
            "description": description,
        }
    }

    resp = requests.post(
        f"https://{JIRA_SITE}/rest/api/3/issue",
        auth=HTTPBasicAuth(email, token),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=30,
    )
    if resp.status_code >= 300:
        print(f"HTTP {resp.status_code}: {resp.text}", file=sys.stderr)
        return 1
    data = resp.json()
    print(json.dumps({"key": data["key"], "id": data["id"], "url": f"https://{JIRA_SITE}/browse/{data['key']}"}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
