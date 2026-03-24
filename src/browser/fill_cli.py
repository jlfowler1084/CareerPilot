"""
CareerPilot CLI — ATS Form Auto-Fill

Usage:
    python cli.py fill <job_url>                  Auto-detect ATS, generate fill prompt
    python cli.py fill <job_url> --ats workday    Force ATS type
    python cli.py fill <job_url> --execute        Generate prompt AND run via Claude Code + Chrome
    python cli.py fill <job_url> --clipboard      Copy cheatsheet to clipboard instead
    python cli.py fill --detect <url>             Just detect the ATS type
    python cli.py fill --list-ats                 Show supported ATS systems
    python cli.py fill --cheatsheet               Print quick-fill cheatsheet from profile
"""

from __future__ import annotations

import sys
import subprocess
from pathlib import Path

from config.settings import DATA_DIR
from src.browser.ats_profiles import (
    ATS_CONFIGS,
    detect_ats_type,
    get_ats_config,
    get_field_count,
)
from src.browser.form_filler import (
    DEFAULT_PROFILE_PATH,
    generate_claude_code_prompt,
    generate_clipboard_cheatsheet,
    load_profile,
)

RESUME_DIR = DATA_DIR / "resumes"


def cmd_fill(
    job_url: str,
    ats_type: str | None = None,
    execute: bool = False,
    clipboard: bool = False,
    profile_path: str = DEFAULT_PROFILE_PATH,
    resume_path: str | None = None,
    cover_letter_path: str | None = None,
):
    """Generate and optionally execute an ATS form-fill prompt."""

    # Auto-detect ATS
    detected = ats_type or detect_ats_type(job_url)
    if detected:
        config = get_ats_config(detected)
        print(f"\n🎯 ATS Detected: {config['name']}")
        print(f"   Pages: {len(config['pages'])}, Fields: {get_field_count(detected)}")
    else:
        print(f"\n⚠️  Could not detect ATS type for: {job_url}")
        print("   Using generic form-fill prompt.")

    # Find resume if not specified
    if not resume_path:
        # Check for most recent tailored resume
        resume_dir = RESUME_DIR
        if resume_dir.exists():
            resumes = sorted(resume_dir.glob("*.docx"), key=lambda p: p.stat().st_mtime, reverse=True)
            if resumes:
                resume_path = str(resumes[0])
                print(f"   Resume: {resume_path}")

    if clipboard:
        cheatsheet = generate_clipboard_cheatsheet(
            ats_type=detected,
            profile_path=profile_path,
        )
        try:
            import pyperclip
            pyperclip.copy(cheatsheet)
            print("\n📋 Cheatsheet copied to clipboard!\n")
        except ImportError:
            pass
        print(cheatsheet)
        return

    # Generate prompt
    prompt = generate_claude_code_prompt(
        job_url=job_url,
        ats_type=detected,
        profile_path=profile_path,
        resume_path=resume_path,
        cover_letter_path=cover_letter_path,
    )

    if execute:
        print("\n🚀 Launching Claude Code with Chrome...\n")
        _execute_with_claude_code(prompt)
    else:
        # Print the prompt for manual use
        print("\n" + "═" * 60)
        print("  CLAUDE CODE PROMPT — copy and paste into Claude Code")
        print("  Run with: claude --chrome")
        print("═" * 60 + "\n")
        print(prompt)
        print("\n" + "═" * 60)

        # Also copy to clipboard if pyperclip available
        try:
            import pyperclip
            pyperclip.copy(prompt)
            print("📋 Prompt copied to clipboard!")
        except ImportError:
            pass
        print()


def _execute_with_claude_code(prompt: str):
    """Execute the prompt via Claude Code CLI with Chrome integration."""
    try:
        result = subprocess.run(
            ["claude", "--chrome", "--print", "-p", prompt],
            capture_output=False,
            text=True,
        )
        if result.returncode != 0:
            print(f"\n⚠️  Claude Code exited with code {result.returncode}")
            print("   Try running the prompt manually: claude --chrome")
    except FileNotFoundError:
        print("\n❌ Claude Code CLI not found.")
        print("   Install it from: https://docs.claude.com/en/docs/claude-code")
        print("   Or copy the prompt above and paste into Claude Code manually.")


def cmd_detect(url: str):
    """Detect which ATS a URL belongs to."""
    detected = detect_ats_type(url)
    if detected:
        config = get_ats_config(detected)
        print(f"\n🎯 Detected: {config['name']}")
        print(f"   Pages: {len(config['pages'])}")
        print(f"   Fields: {get_field_count(detected)}")
        print(f"\n   Quirks:")
        for q in config.get("quirks", []):
            print(f"     • {q}")
    else:
        print(f"\n⚠️  Could not detect ATS type for: {url}")
        print("   Supported systems: " + ", ".join(c["name"] for c in ATS_CONFIGS.values()))
    print()


def cmd_list_ats():
    """List all supported ATS systems."""
    print("\n📋 Supported ATS Systems\n")
    for ats_name, config in ATS_CONFIGS.items():
        field_count = get_field_count(ats_name)
        page_count = len(config["pages"])
        patterns = ", ".join(config["detect_patterns"][:3])
        print(f"  [{ats_name}] {config['name']}")
        print(f"    Pages: {page_count}, Fields: {field_count}")
        print(f"    Detected by: {patterns}")
        print()


def cmd_cheatsheet(profile_path: str = DEFAULT_PROFILE_PATH):
    """Print the quick-fill cheatsheet."""
    cheatsheet = generate_clipboard_cheatsheet(profile_path=profile_path)
    print(cheatsheet)
    try:
        import pyperclip
        pyperclip.copy(cheatsheet)
        print("\n📋 Copied to clipboard!")
    except ImportError:
        pass


# ── CLI Router ───────────────────────────────────────────────────────

def fill_cli(args: list[str]):
    """Route fill subcommands."""
    if not args:
        print(__doc__)
        return

    # Flags
    if args[0] == "--list-ats":
        cmd_list_ats()
        return

    if args[0] == "--cheatsheet":
        profile_path = DEFAULT_PROFILE_PATH
        if "--profile" in args:
            idx = args.index("--profile")
            if idx + 1 < len(args):
                profile_path = args[idx + 1]
        cmd_cheatsheet(profile_path)
        return

    if args[0] == "--detect" and len(args) >= 2:
        cmd_detect(args[1])
        return

    # Main fill command
    job_url = args[0]
    ats_type = None
    execute = False
    clipboard = False
    profile_path = "data/profile.json"
    resume_path = None
    cover_letter_path = None

    i = 1
    while i < len(args):
        if args[i] == "--ats" and i + 1 < len(args):
            ats_type = args[i + 1]
            i += 2
        elif args[i] == "--execute":
            execute = True
            i += 1
        elif args[i] == "--clipboard":
            clipboard = True
            i += 1
        elif args[i] == "--profile" and i + 1 < len(args):
            profile_path = args[i + 1]
            i += 2
        elif args[i] == "--resume" and i + 1 < len(args):
            resume_path = args[i + 1]
            i += 2
        elif args[i] == "--cover-letter" and i + 1 < len(args):
            cover_letter_path = args[i + 1]
            i += 2
        else:
            i += 1

    cmd_fill(
        job_url=job_url,
        ats_type=ats_type,
        execute=execute,
        clipboard=clipboard,
        profile_path=profile_path,
        resume_path=resume_path,
        cover_letter_path=cover_letter_path,
    )
