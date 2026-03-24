#!/usr/bin/env bash
# Log Claude Code billing, auth, and API error events.
# Called by hooks in .claude/settings.json for StopFailure and Notification events.
# Reads JSON from stdin, extracts event details, appends timestamped line to billing-events.log.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGFILE="$SCRIPT_DIR/billing-events.log"

INPUT=$(cat)

echo "$INPUT" | python -c "
import sys, json
from datetime import datetime

raw = sys.stdin.read().strip()
try:
    d = json.loads(raw) if raw else {}
except Exception:
    d = {'_raw': raw}

ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
event = d.get('hook_event_name', d.get('event', 'unknown'))
session = (d.get('session_id') or '')[:8]

error = d.get('error', {})
if isinstance(error, dict):
    etype = error.get('type', '')
    emsg = error.get('message', '')
else:
    etype = str(error)
    emsg = ''

notif = d.get('notification_type', d.get('type', ''))
msg = d.get('message', d.get('stop_reason', ''))

parts = [f'[{ts}]', f'event={event}']
if session:
    parts.append(f'session={session}')
if etype:
    parts.append(f'error_type={etype}')
if emsg:
    parts.append(f'error_detail={emsg}')
if notif:
    parts.append(f'notification={notif}')
if msg:
    parts.append(f'message={msg}')

print(' '.join(parts))
" >> "$LOGFILE" 2>/dev/null
