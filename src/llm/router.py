"""LLM router — dispatches to local or Claude provider based on task config and policy."""

from __future__ import annotations

import logging as _logging
import os
import sys as _sys
import time
from typing import Dict, List, Optional, Union

from config import settings
from src.db.models import get_connection
from src.llm.failure import (
    INFRA_COUNTABLE_REASONS,
    FallbackBudget,
    FallbackBudgetExhausted,
    ProviderInfraError,
    SchemaValidationError,
    is_interactive_session,
    prompt_for_pii_fallback,
)
from src.llm.logging import log_llm_call
from src.llm.providers.base import ProviderResponse
from src.llm.providers.claude import ClaudeProvider
from src.llm.providers.local import LocalProvider

_logger = _logging.getLogger(__name__)


class LLMRouter:
    """Routes LLM calls to local or Claude provider with failure handling and logging.

    Instantiate once per process; use the module-level singleton `router`.
    """

    def __init__(self) -> None:
        self._claude = ClaudeProvider(api_key=settings.ANTHROPIC_API_KEY)
        self._local = LocalProvider(
            chat_base_url=settings.LLM_LOCAL_BASE_URL,
            embed_base_url=settings.LLM_LOCAL_EMBED_BASE_URL,
            chat_model=settings.LLM_LOCAL_MODEL_CHAT,
            embed_model=settings.LLM_LOCAL_MODEL_EMBED,
            api_key=settings.LLM_LOCAL_API_KEY,
        )
        if (
            os.environ.get("CAREERPILOT_UNATTENDED") == "1"
            and _sys.stdin.isatty()
            and _sys.stdout.isatty()
        ):
            _logger.warning(
                "CAREERPILOT_UNATTENDED=1 is set in an interactive terminal session. "
                "PII fallback prompts will fail closed silently. "
                "Unset this variable if running interactively."
            )

    def _resolve_provider(self, task: str) -> str:
        """Determine which provider to use for the given task.

        Checks, in order:
        1. LLM_KILL_SWITCH env var — forces Claude for all tasks when set.
        2. Per-task env var CAREERPILOT_LLM_TASK_<TASK_ID_UPPER>.
        3. TASK_MODEL_MAP — "local" maps to local; anything else maps to Claude.

        Returns:
            "local" or "claude".
        """
        if settings.LLM_KILL_SWITCH:
            return "claude"
        env_key = "CAREERPILOT_LLM_TASK_" + task.upper().replace("-", "_")
        override = os.getenv(env_key, "")
        if override == "local":
            return "local"
        if override:  # non-empty, non-"local": treat as a Claude model ID
            return "claude"
        mapped = settings.TASK_MODEL_MAP.get(task, "claude")
        return "local" if mapped == "local" else "claude"

    def _resolve_model(self, task: str) -> str:
        """Resolve the Claude model ID for a task, applying env var overrides.

        Used only when routing to Claude. Checks:
        1. Per-task env var CAREERPILOT_LLM_TASK_<TASK_ID_UPPER> (explicit model ID).
        2. TASK_MODEL_MAP — if not "local", the value is the Claude model ID.
        3. Fallback to MODEL_SONNET.

        Returns:
            Claude model ID string.
        """
        env_key = "CAREERPILOT_LLM_TASK_" + task.upper().replace("-", "_")
        override = os.getenv(env_key, "")
        if override and override not in ("local", "claude"):
            return override  # explicit Claude model ID in env var
        mapped = settings.TASK_MODEL_MAP.get(task, settings.MODEL_SONNET)
        if mapped != "local":
            return mapped  # R10 task: map has the Claude model ID
        return settings.MODEL_SONNET  # R9 task forced to Claude: default to Sonnet

    def complete(
        self, task: str, prompt: str, schema: Optional[Dict] = None, **overrides
    ) -> Union[Dict, List, str]:
        """Send a completion request for the given task.

        Args:
            task: Task ID from TASK_MODEL_MAP / TASK_CONFIG (e.g. "email_classify").
            prompt: User-side prompt text.
            schema: Optional JSON schema override. If None, uses TASK_CONFIG schema.
            **overrides: Per-call overrides — model, max_tokens, temperature.

        Returns:
            Parsed dict or list (for schema tasks) or raw string (for prose tasks).

        Raises:
            KeyError: If task is not in TASK_CONFIG.
        """
        cfg = settings.TASK_CONFIG[task]  # raises KeyError for unknown tasks
        conn = get_connection()

        max_tokens = overrides.get("max_tokens") or cfg["max_tokens"]
        temperature = overrides.get("temperature")
        system_prompt = cfg["system_prompt"]
        effective_schema = schema if schema is not None else cfg.get("schema")

        env_key = "CAREERPILOT_LLM_TASK_" + task.upper().replace("-", "_")
        env_override = os.getenv(env_key, "")

        def _return(response: ProviderResponse) -> Union[Dict, List, str]:
            return response.parsed if effective_schema is not None else response.raw_text

        def _resp_text(response: ProviderResponse) -> str:
            return response.raw_text if response.raw_text else str(response.parsed or "")

        # ── Kill-switch ──────────────────────────────────────────────────────────
        if settings.LLM_KILL_SWITCH:
            model = overrides.get("model") or self._resolve_model(task)
            t0 = time.monotonic()
            response = self._claude.complete(
                task=task, system_prompt=system_prompt, prompt=prompt,
                model=model, max_tokens=max_tokens, temperature=temperature,
                schema=effective_schema,
            )
            log_llm_call(
                conn, task=task, provider_used="claude", model=model,
                prompt=prompt, response_text=_resp_text(response),
                fallback_reason="kill_switch",
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
            conn.commit()
            return _return(response)

        # ── Env override ─────────────────────────────────────────────────────────
        if env_override:
            t0 = time.monotonic()
            if env_override == "local":
                response = self._local.complete(
                    task=task, system_prompt=system_prompt, prompt=prompt,
                    model=settings.LLM_LOCAL_MODEL_CHAT, max_tokens=max_tokens,
                    temperature=temperature, schema=effective_schema,
                )
                prov, mdl = "local", settings.LLM_LOCAL_MODEL_CHAT
            else:
                response = self._claude.complete(
                    task=task, system_prompt=system_prompt, prompt=prompt,
                    model=env_override, max_tokens=max_tokens, temperature=temperature,
                    schema=effective_schema,
                )
                prov, mdl = "claude", env_override
            log_llm_call(
                conn, task=task, provider_used=prov, model=mdl,
                prompt=prompt, response_text=_resp_text(response),
                fallback_reason="env_override",
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
            conn.commit()
            return _return(response)

        # ── Claude-default task ──────────────────────────────────────────────────
        provider_name = self._resolve_provider(task)
        if provider_name == "claude":
            model = overrides.get("model") or self._resolve_model(task)
            t0 = time.monotonic()
            response = self._claude.complete(
                task=task, system_prompt=system_prompt, prompt=prompt,
                model=model, max_tokens=max_tokens, temperature=temperature,
                schema=effective_schema,
            )
            log_llm_call(
                conn, task=task, provider_used="claude", model=model,
                prompt=prompt, response_text=_resp_text(response),
                fallback_reason=None,
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
            conn.commit()
            return _return(response)

        # ── Local task ───────────────────────────────────────────────────────────
        budget = FallbackBudget(settings.LLM_FALLBACK_BUDGET_PER_DAY)
        claude_model = overrides.get("model") or self._resolve_model(task)

        # Happy path
        try:
            t0 = time.monotonic()
            response = self._local.complete(
                task=task, system_prompt=system_prompt, prompt=prompt,
                model=settings.LLM_LOCAL_MODEL_CHAT, max_tokens=max_tokens,
                temperature=temperature, schema=effective_schema,
            )
            latency = int((time.monotonic() - t0) * 1000)
            log_llm_call(
                conn, task=task, provider_used="local", model=settings.LLM_LOCAL_MODEL_CHAT,
                prompt=prompt, response_text=_resp_text(response),
                fallback_reason=None, latency_ms=latency,
            )
            conn.commit()
            return _return(response)

        except (ProviderInfraError, SchemaValidationError) as local_exc:
            schema_fail = isinstance(local_exc, SchemaValidationError)
            error_kind = str(local_exc) if not schema_fail else None

            # Atomic two-row write
            prev_iso = conn.isolation_level
            conn.isolation_level = None
            conn.execute("BEGIN IMMEDIATE")
            committed = False
            try:
                # Row 1: local failure record
                log_llm_call(
                    conn, task=task, provider_used="local",
                    model=settings.LLM_LOCAL_MODEL_CHAT,
                    prompt=prompt, response_text="",
                    schema_invalid=schema_fail,
                    fallback_reason=error_kind,
                    latency_ms=None,
                )

                # Budget check — only for infra failures (schema fails are quality, not infra)
                if not schema_fail:
                    budget.consume_slot(conn)  # raises FallbackBudgetExhausted if over limit

                # PII policy: ask user in interactive mode, fail closed otherwise
                pii_policy = cfg.get("fallback_policy", "allow")
                if pii_policy == "prompt":
                    if not is_interactive_session() or not prompt_for_pii_fallback(task):
                        log_llm_call(
                            conn, task=task, provider_used="claude", model=claude_model,
                            prompt=prompt, response_text="",
                            fallback_reason="pii_fallback_blocked", latency_ms=0,
                        )
                        conn.execute("COMMIT")
                        committed = True
                        raise local_exc

                # Row 2: Claude replacement/fallback
                t0 = time.monotonic()
                response = self._claude.complete(
                    task=task, system_prompt=system_prompt, prompt=prompt,
                    model=claude_model, max_tokens=max_tokens, temperature=temperature,
                    schema=effective_schema,
                )
                latency = int((time.monotonic() - t0) * 1000)
                log_llm_call(
                    conn, task=task, provider_used="claude", model=claude_model,
                    prompt=prompt, response_text=_resp_text(response),
                    fallback_reason=None, latency_ms=latency,
                )
                conn.execute("COMMIT")
                committed = True
                return _return(response)

            except FallbackBudgetExhausted:
                log_llm_call(
                    conn, task=task, provider_used="claude", model=claude_model,
                    prompt=prompt, response_text="",
                    fallback_reason="fallback_budget_exhausted", latency_ms=0,
                )
                conn.execute("COMMIT")
                committed = True
                raise

            except Exception:
                if not committed:
                    conn.execute("ROLLBACK")
                raise

            finally:
                conn.isolation_level = prev_iso

    def embed(self, task: str, text: str) -> List:
        """Generate an embedding vector using the local provider.

        Args:
            task: Task ID (use "embed_default").
            text: Text to embed.

        Returns:
            List of floats.
        """
        return self._local.embed(task=task, text=text, model=settings.LLM_LOCAL_MODEL_EMBED)


# Module-level singleton — import and use this in migrated modules.
router = LLMRouter()
