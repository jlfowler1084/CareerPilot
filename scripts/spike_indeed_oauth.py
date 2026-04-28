#!/usr/bin/env python3
"""spike_indeed_oauth.py — Pre-plan auth-flow spike for CAR-189 v2 bundle.

Tickets: CAR-192 (S2 / SDK migration) -> validates the auth path that S3 will use.

Purpose
-------
Validate that OAuth 2.1 + PKCE against ``secure.indeed.com`` produces an
access token that Indeed MCP (``mcp.indeed.com/claude/mcp``) accepts for
``tools/call name=search_jobs``, AND that the ``refresh_token`` grant produces
a working unattended re-run from persisted storage.

Spec: ``docs/brainstorms/2026-04-27-CAR-189-v2-bundle-requirements.md``
section "Pre-Plan Auth Spike".

PASS criterion (Go/No-Go for S3)
--------------------------------
* First run (interactive): browser auth completes, ``search_jobs`` returns >0 jobs.
* Second run (``--headless``): refresh-token grant succeeds, ``search_jobs``
  returns >0 jobs without user interaction.

FAIL recovery (per brainstorm § Pre-Plan Auth Spike)
----------------------------------------------------
* First call works, headless fails -> dynamic auth is interactive-only,
  S3 dropped from cycle, scheduled run unattended-viable is FALSE.
* First call fails on auth grounds -> S3 dropped, S2 (CAR-192) re-evaluated
  for whether the SDK migration is still worth doing standalone.

Usage
-----
::

    # First run (interactive browser auth):
    python scripts/spike_indeed_oauth.py

    # Second run (headless refresh validation; must follow first run):
    python scripts/spike_indeed_oauth.py --headless

    # Force the headless path even if cached access_token is still fresh:
    python scripts/spike_indeed_oauth.py --force-refresh

Notes
-----
* The spike uses ``httpx`` directly (already a transitive dep) rather than the
  ``mcp`` Python SDK. The brainstorm calls for SDK-based S2/S3, but the spike's
  job is to prove the OAuth + MCP-call combination is feasible at all -- the
  hand-rolled HTTP path is well-validated already (mirrors the working
  ``src/jobs/searcher.py::_search_dice_direct`` pattern). If this spike PASSes,
  S2 re-implements via the SDK; if it FAILs, the SDK wouldn't have helped.
* Tokens are written to ``data/oauth_tokens/indeed.json`` (mode 0o600 on
  POSIX). ``data/oauth_tokens/`` is gitignored.
* On the first run the script opens the system browser to Indeed's auth page.
  Have your Indeed credentials ready.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import logging
import os
import secrets
import socketserver
import sys
import threading
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

try:
    import httpx
except ImportError:
    sys.stderr.write(
        "ERROR: httpx is required. Install with: python -m pip install httpx\n"
    )
    sys.exit(1)


# UTF-8 stdout/stderr on Windows so logging emoji-free output renders correctly.
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except AttributeError:
        pass


# ---- Constants ----------------------------------------------------------------

INDEED_MCP_URL = "https://mcp.indeed.com/claude/mcp"
INDEED_RESOURCE_METADATA_URL = (
    "https://mcp.indeed.com/.well-known/oauth-protected-resource/claude/mcp"
)
INDEED_AUTH_SERVER = "https://secure.indeed.com"
INDEED_AUTH_METADATA_URL = (
    f"{INDEED_AUTH_SERVER}/.well-known/oauth-authorization-server"
)

CALLBACK_PORT = 8765
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"
SCOPES = ["job_seeker.jobs.search", "offline_access"]
CLIENT_NAME = "CareerPilot Spike (CAR-189)"
PROTOCOL_VERSION = "2025-03-26"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOKEN_STORAGE_PATH = PROJECT_ROOT / "data" / "oauth_tokens" / "indeed.json"
CLIENT_REGISTRATION_PATH = (
    PROJECT_ROOT / "data" / "oauth_tokens" / "indeed_client.json"
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("indeed_oauth_spike")


# ---- Persistent token storage (S2 will formalize this) ------------------------


class JsonFileStorage:
    """Minimal disk-backed JSON store. S2 promotes this to JsonFileTokenStorage."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> dict | None:
        if not self.path.exists():
            return None
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Storage at %s is corrupt; ignoring.", self.path)
            return None

    def save(self, payload: dict) -> None:
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        try:
            self.path.chmod(0o600)
        except OSError:
            # Windows: ACLs are inherited from the parent directory.
            pass


# ---- OAuth metadata discovery -------------------------------------------------


def discover_oauth_metadata() -> tuple[dict, dict]:
    """Fetch RFC 9728 protected-resource metadata + RFC 8414 auth-server metadata."""
    logger.info("Discovering Indeed OAuth metadata...")
    with httpx.Client(timeout=10) as client:
        rs_resp = client.get(INDEED_RESOURCE_METADATA_URL)
        rs_resp.raise_for_status()
        rs_meta = rs_resp.json()
        logger.info(
            "Resource metadata: scopes=%s authorization_servers=%s",
            rs_meta.get("scopes_supported"),
            rs_meta.get("authorization_servers"),
        )

        as_resp = client.get(INDEED_AUTH_METADATA_URL)
        as_resp.raise_for_status()
        as_meta = as_resp.json()
        logger.info(
            "Auth-server: issuer=%s authorize=%s token=%s",
            as_meta.get("issuer"),
            as_meta.get("authorization_endpoint"),
            as_meta.get("token_endpoint"),
        )
    return rs_meta, as_meta


# ---- Client registration (cached -> env var -> dynamic) -----------------------


def register_or_load_client(as_meta: dict) -> dict:
    """Resolve a client_id by these strategies in order:

    1. Cached registration on disk (``data/oauth_tokens/indeed_client.json``).
    2. Pre-registered client via env vars ``INDEED_OAUTH_CLIENT_ID`` (and
       optionally ``INDEED_OAUTH_CLIENT_SECRET`` for confidential clients).
    3. RFC 7591 dynamic registration against ``registration_endpoint``.
    """
    storage = JsonFileStorage(CLIENT_REGISTRATION_PATH)
    cached = storage.load()
    if cached and cached.get("client_id"):
        logger.info(
            "Loaded cached client registration: client_id=%s", cached["client_id"]
        )
        return cached

    env_client_id = os.environ.get("INDEED_OAUTH_CLIENT_ID")
    if env_client_id:
        client_info = {
            "client_id": env_client_id,
            "client_secret": os.environ.get("INDEED_OAUTH_CLIENT_SECRET", ""),
        }
        logger.info(
            "Using pre-registered client from env: client_id=%s", env_client_id
        )
        storage.save(client_info)
        return client_info

    reg_endpoint = as_meta.get("registration_endpoint")
    if not reg_endpoint:
        raise RuntimeError(
            "No registration_endpoint in authorization-server metadata, no cached "
            "registration, and no INDEED_OAUTH_CLIENT_ID env var. Pre-register an "
            "Indeed developer client and set INDEED_OAUTH_CLIENT_ID, then re-run."
        )

    logger.info("Performing RFC 7591 dynamic client registration at %s ...", reg_endpoint)
    with httpx.Client(timeout=15) as client:
        resp = client.post(
            reg_endpoint,
            json={
                "client_name": CLIENT_NAME,
                "redirect_uris": [REDIRECT_URI],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",  # public client (PKCE)
                "scope": " ".join(SCOPES),
            },
        )
        if resp.status_code >= 400:
            logger.error(
                "Dynamic registration failed: %d %s\nBody: %s",
                resp.status_code,
                resp.reason_phrase,
                resp.text[:500],
            )
            resp.raise_for_status()
        client_info = resp.json()
        logger.info(
            "Dynamic registration succeeded: client_id=%s",
            client_info.get("client_id"),
        )

    storage.save(client_info)
    return client_info


# ---- PKCE ---------------------------------------------------------------------


def generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) per RFC 7636 (S256)."""
    code_verifier = (
        base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")
    )
    challenge_bytes = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = (
        base64.urlsafe_b64encode(challenge_bytes).decode("ascii").rstrip("=")
    )
    return code_verifier, code_challenge


# ---- Local callback listener --------------------------------------------------


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    captured_code: str | None = None
    captured_state: str | None = None
    captured_error: str | None = None

    def do_GET(self) -> None:  # noqa: N802 (stdlib name)
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return
        params = urllib.parse.parse_qs(parsed.query)
        if "error" in params:
            _CallbackHandler.captured_error = params["error"][0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<h1>Auth failed</h1><p>Check the spike script logs.</p>"
            )
            return
        _CallbackHandler.captured_code = params.get("code", [None])[0]
        _CallbackHandler.captured_state = params.get("state", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(
            b"<h1>Auth captured</h1>"
            b"<p>You can close this tab and return to the terminal.</p>"
        )

    def log_message(self, *args, **kwargs) -> None:  # silence default access log
        return


def run_local_listener_and_open_browser(authorize_url: str, expected_state: str) -> str:
    """Start listener on REDIRECT_URI, open browser, return authorization code."""
    _CallbackHandler.captured_code = None
    _CallbackHandler.captured_state = None
    _CallbackHandler.captured_error = None

    server = socketserver.TCPServer(("127.0.0.1", CALLBACK_PORT), _CallbackHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    logger.info("Local callback listener running on %s", REDIRECT_URI)
    logger.info("Opening browser for Indeed authorization ...")
    webbrowser.open(authorize_url)

    deadline = time.time() + 300  # 5-minute timeout
    try:
        while time.time() < deadline:
            if _CallbackHandler.captured_error:
                raise RuntimeError(
                    f"Authorization failed: {_CallbackHandler.captured_error}"
                )
            if _CallbackHandler.captured_code:
                if _CallbackHandler.captured_state != expected_state:
                    raise RuntimeError("State mismatch — possible CSRF; aborting.")
                return _CallbackHandler.captured_code
            time.sleep(0.2)
        raise TimeoutError("Auth callback not received within 5 minutes.")
    finally:
        server.shutdown()
        server.server_close()


# ---- Token endpoint exchanges -------------------------------------------------


def exchange_code_for_tokens(
    as_meta: dict, client_info: dict, code: str, code_verifier: str
) -> dict:
    """Authorization-code grant + PKCE -> access_token + (usually) refresh_token.

    Per the MCP authorization spec, the ``resource`` parameter (RFC 8707) is
    REQUIRED so the issued token's audience matches ``INDEED_MCP_URL``.
    Without it the MCP rejects the bearer token as ``invalid_token``.
    """
    token_endpoint = as_meta["token_endpoint"]
    logger.info("Exchanging authorization code for tokens at %s ...", token_endpoint)
    with httpx.Client(timeout=15) as client:
        resp = client.post(
            token_endpoint,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT_URI,
                "client_id": client_info["client_id"],
                "code_verifier": code_verifier,
                "resource": INDEED_MCP_URL,
            },
            headers={"Accept": "application/json"},
        )
        if resp.status_code >= 400:
            logger.error(
                "Token exchange failed: %d %s\nBody: %s",
                resp.status_code,
                resp.reason_phrase,
                resp.text[:500],
            )
            resp.raise_for_status()
        tokens = resp.json()
    tokens["obtained_at"] = datetime.now(tz=timezone.utc).isoformat()
    granted_scope = tokens.get("scope", "")
    logger.info(
        "Token exchanged. granted_scope=%r token_type=%s expires_in=%s has_refresh=%s",
        granted_scope,
        tokens.get("token_type"),
        tokens.get("expires_in"),
        bool(tokens.get("refresh_token")),
    )
    if "job_seeker.jobs.search" not in granted_scope:
        logger.warning(
            "Granted scope does not include job_seeker.jobs.search — MCP search_jobs "
            "will likely reject this token even with the correct audience."
        )
    return tokens


def refresh_access_token(as_meta: dict, client_info: dict, refresh_token: str) -> dict:
    """Refresh-token grant.

    Includes the same ``resource`` parameter as the initial exchange so the
    refreshed access_token is bound to the MCP audience.
    """
    token_endpoint = as_meta["token_endpoint"]
    logger.info("Refreshing access token at %s ...", token_endpoint)
    with httpx.Client(timeout=15) as client:
        resp = client.post(
            token_endpoint,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_info["client_id"],
                "resource": INDEED_MCP_URL,
            },
            headers={"Accept": "application/json"},
        )
        if resp.status_code >= 400:
            logger.error(
                "Refresh failed: %d %s\nBody: %s",
                resp.status_code,
                resp.reason_phrase,
                resp.text[:500],
            )
            resp.raise_for_status()
        tokens = resp.json()
    tokens["obtained_at"] = datetime.now(tz=timezone.utc).isoformat()
    if "refresh_token" not in tokens:
        # Auth servers commonly omit the refresh_token on refresh responses.
        # Carry the prior one forward so subsequent refreshes still work.
        tokens["refresh_token"] = refresh_token
    return tokens


# ---- MCP call (mirror of src/jobs/searcher.py::_search_dice_direct) -----------


def call_indeed_search_jobs(access_token: str, keywords: str, location: str) -> dict:
    """Initialize MCP session, send notifications/initialized, call search_jobs."""
    base_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {access_token}",
    }

    with httpx.Client(timeout=30) as client:
        logger.info("MCP initialize against %s ...", INDEED_MCP_URL)
        init_resp = client.post(
            INDEED_MCP_URL,
            headers=base_headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {
                        "name": "careerpilot-spike",
                        "version": "0.1.0",
                    },
                },
            },
        )
        init_resp.raise_for_status()

        session_id = init_resp.headers.get("mcp-session-id", "")
        session_headers = dict(base_headers)
        if session_id:
            session_headers["mcp-session-id"] = session_id
            logger.info("MCP session id: %s", session_id)
        else:
            logger.info("No mcp-session-id assigned; proceeding stateless.")

        logger.info("MCP notifications/initialized ...")
        client.post(
            INDEED_MCP_URL,
            headers=session_headers,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            timeout=5,
        )

        logger.info(
            "MCP tools/call name=search_jobs keywords=%r location=%r ...",
            keywords,
            location,
        )
        result_resp = client.post(
            INDEED_MCP_URL,
            headers=session_headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "search_jobs",
                    "arguments": {"keywords": keywords, "location": location},
                },
            },
            timeout=30,
        )
        result_resp.raise_for_status()

        content_type = result_resp.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            for line in result_resp.text.splitlines():
                if line.startswith("data: "):
                    try:
                        event_data = json.loads(line[6:])
                    except json.JSONDecodeError:
                        continue
                    if "result" in event_data:
                        return event_data["result"]
            return {}
        return result_resp.json().get("result", {})


def evaluate_result(result: dict) -> int:
    """Count jobs returned by search_jobs. Mirrors searcher.py result-shape parsing."""
    jobs: list = []
    if "structuredContent" in result and result["structuredContent"]:
        jobs = result["structuredContent"].get("data", []) or []
    elif "content" in result:
        for block in result.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "text":
                try:
                    parsed = json.loads(block.get("text", ""))
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, list):
                    jobs = parsed
                    break
                if isinstance(parsed, dict) and "results" in parsed:
                    jobs = parsed["results"]
                    break
    return len(jobs)


# ---- Orchestration ------------------------------------------------------------


def run_interactive_first_auth() -> None:
    """Discover -> register -> authorization-code + PKCE -> persist tokens."""
    _, as_meta = discover_oauth_metadata()
    client_info = register_or_load_client(as_meta)
    code_verifier, code_challenge = generate_pkce()
    state = secrets.token_urlsafe(16)

    auth_params = {
        "response_type": "code",
        "client_id": client_info["client_id"],
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(SCOPES),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        # MCP authorization spec requires resource indicator (RFC 8707).
        # Without this the issued token's audience won't match Indeed MCP.
        "resource": INDEED_MCP_URL,
    }
    authorize_url = (
        as_meta["authorization_endpoint"]
        + "?"
        + urllib.parse.urlencode(auth_params)
    )

    code = run_local_listener_and_open_browser(authorize_url, expected_state=state)
    tokens = exchange_code_for_tokens(as_meta, client_info, code, code_verifier)

    JsonFileStorage(TOKEN_STORAGE_PATH).save(tokens)
    logger.info("Tokens persisted to %s", TOKEN_STORAGE_PATH)


def run_headless_refresh() -> None:
    """Discover -> load cached refresh_token -> refresh -> persist."""
    _, as_meta = discover_oauth_metadata()
    client_info = register_or_load_client(as_meta)

    storage = JsonFileStorage(TOKEN_STORAGE_PATH)
    tokens = storage.load()
    if not tokens or not tokens.get("refresh_token"):
        raise RuntimeError(
            f"No cached tokens with refresh_token at {TOKEN_STORAGE_PATH}. "
            "Run the interactive flow first (without --headless)."
        )

    refreshed = refresh_access_token(as_meta, client_info, tokens["refresh_token"])
    storage.save(refreshed)
    logger.info("Refreshed tokens persisted to %s", TOKEN_STORAGE_PATH)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Skip interactive auth; use cached refresh_token to refresh access_token.",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Like --headless, but explicitly clears the cached access_token first.",
    )
    parser.add_argument(
        "--keywords",
        default="systems engineer",
        help="search_jobs keywords arg (default: 'systems engineer').",
    )
    parser.add_argument(
        "--location",
        default="Indianapolis",
        help="search_jobs location arg (default: 'Indianapolis').",
    )
    args = parser.parse_args()

    storage = JsonFileStorage(TOKEN_STORAGE_PATH)

    if args.force_refresh:
        cached = storage.load() or {}
        cached.pop("access_token", None)
        if cached:
            storage.save(cached)
            logger.info("Cleared cached access_token; refresh_token retained.")

    headless_mode = args.headless or args.force_refresh

    try:
        if headless_mode:
            run_headless_refresh()
        else:
            run_interactive_first_auth()
    except Exception as exc:
        mode_label = "Headless refresh" if headless_mode else "Interactive auth"
        logger.error("%s failed: %s", mode_label, exc)
        if headless_mode:
            logger.error(
                "FAIL — refresh path does not produce an unattended token. "
                "Per brainstorm § Pre-Plan Auth Spike, S3 should be deferred to v3."
            )
        else:
            logger.error(
                "FAIL — OAuth 2.1 flow against secure.indeed.com did not complete. "
                "Per brainstorm § Pre-Plan Auth Spike, S3 should be deferred to v3 "
                "and S2 (CAR-192) re-evaluated for standalone justification."
            )
        return 2

    tokens = storage.load()
    if not tokens or not tokens.get("access_token"):
        logger.error("No access_token in storage after auth flow. FAIL.")
        return 2

    try:
        result = call_indeed_search_jobs(
            tokens["access_token"], args.keywords, args.location
        )
    except httpx.HTTPStatusError as exc:
        logger.error("MCP call failed: %s", exc)
        body = exc.response.text[:500] if exc.response is not None else "<no body>"
        logger.error("Body: %s", body)
        logger.error(
            "FAIL — Indeed MCP rejected the access token. Possible scope mismatch "
            "or token-shape issue (Indeed may want a different audience claim)."
        )
        return 2
    except Exception as exc:
        logger.error("MCP call failed: %s", exc, exc_info=True)
        return 2

    job_count = evaluate_result(result)
    logger.info("MCP search_jobs returned %d jobs.", job_count)

    if job_count == 0:
        logger.error(
            "FAIL — search_jobs returned zero results. Could be (a) auth (token "
            "missing job_seeker.jobs.search scope), (b) Indeed throttled, or (c) "
            "genuinely no matches for keywords=%r location=%r. Try other args.",
            args.keywords,
            args.location,
        )
        return 1

    flow_label = "refresh_token" if headless_mode else "auth_code"
    logger.info(
        "PASS (%s flow) — Indeed MCP search_jobs returned %d jobs.",
        flow_label,
        job_count,
    )
    if not headless_mode:
        logger.info(
            "Next step: re-run with --headless to validate the refresh path. "
            "Both runs must PASS for the brainstorm's Go/No-Go spike to be PASS."
        )
    else:
        logger.info(
            "Both flows now validated. S3 (Indeed adapter) is unblocked for the cycle."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
