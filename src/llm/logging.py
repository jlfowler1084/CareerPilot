"""LLM call logging — writes rows to llm_calls with PII-aware truncation."""

from __future__ import annotations

# Unit 4 implementation


def log_llm_call(
    conn,
    task: str,
    provider_used: str,
    model: str,
    prompt: str,
    response_text: str,
    schema_invalid: bool = False,
    fallback_reason: str = None,
    latency_ms: int = None,
) -> int:
    """Log an LLM call to the llm_calls table.

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
    raise NotImplementedError("Unit 4 not yet implemented")
