"""LLM call logging — writes rows to llm_calls with PII-aware truncation."""

from __future__ import annotations

import hashlib
from typing import Optional


def log_llm_call(
    conn,
    task: str,
    provider_used: str,
    model: str,
    prompt: str,
    response_text: str,
    schema_invalid: bool = False,
    fallback_reason: Optional[str] = None,
    latency_ms: Optional[int] = None,
) -> int:
    """Log an LLM call to the llm_calls table.

    Does NOT commit — the caller manages the transaction.

    Args:
        conn: SQLite connection.
        task: Task ID.
        provider_used: "local" or "claude".
        model: Model name used.
        prompt: Full prompt text (will be truncated/hashed based on PII policy).
        response_text: Full response text.
        schema_invalid: True if schema validation failed.
        fallback_reason: Reason for fallback (for local rows) or NULL (for claude rows).
        latency_ms: Round-trip latency in milliseconds.

    Returns:
        Inserted row id.
    """
    from config import settings
    task_cfg = settings.TASK_CONFIG.get(task, {})
    pii_bearing = task_cfg.get("fallback_policy") == "prompt"

    if pii_bearing:
        limit = 512
        prompt_sha = hashlib.sha256((prompt or "").encode("utf-8")).hexdigest()
        resp_sha = hashlib.sha256((response_text or "").encode("utf-8")).hexdigest()
    else:
        limit = 16384
        prompt_sha = None
        resp_sha = None

    cur = conn.execute(
        "INSERT INTO llm_calls "
        "(task, provider_used, model, prompt, prompt_sha256, response, response_sha256, "
        "schema_invalid, pii_bearing, fallback_reason, latency_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            task,
            provider_used,
            model,
            (prompt or "")[:limit],
            prompt_sha,
            (response_text or "")[:limit],
            resp_sha,
            1 if schema_invalid else 0,
            1 if pii_bearing else 0,
            fallback_reason,
            latency_ms,
        ),
    )
    return cur.lastrowid
