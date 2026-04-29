"""Generic Discord webhook helper for CareerPilot (CAR-196).

Reads webhook URL from ``DISCORD_WEBHOOK_URL_<CHANNEL>`` env vars where
``<CHANNEL>`` is the channel name uppercased and underscored
(``careerpilot-updates`` -> ``CAREERPILOT_UPDATES``).

Stdlib-only (uses ``urllib.request``) so no new declared dependency. Mirrors
the never-raises contract used by ``src/jobs/discord_summary.py`` — webhook
failures are logged and swallowed; alerting is best-effort.

Future: ``src/jobs/discord_summary.py`` is slated to migrate from the
pwsh-subprocess transport to this helper (see its module docstring).
"""

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 10
DISCORD_CONTENT_LIMIT = 2000


def env_var_for_channel(channel: str) -> str:
    """``careerpilot-updates`` -> ``DISCORD_WEBHOOK_URL_CAREERPILOT_UPDATES``."""
    sanitized = channel.replace("-", "_").upper()
    return f"DISCORD_WEBHOOK_URL_{sanitized}"


def post(channel: str, message: str, *, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> bool:
    """Post a plain-text message to the channel's webhook.

    Args:
        channel: Logical channel name (e.g. ``"careerpilot-updates"``).
        message: Message body. Truncated to 2000 chars (Discord's hard limit).
        timeout: HTTP timeout in seconds.

    Returns:
        ``True`` on HTTP 2xx, ``False`` otherwise. Never raises.
    """
    env_var = env_var_for_channel(channel)
    webhook_url = os.environ.get(env_var, "")
    if not webhook_url:
        logger.warning(
            "discord.post: %s is unset; cannot post to channel %r",
            env_var,
            channel,
        )
        return False

    if len(message) > DISCORD_CONTENT_LIMIT:
        message = message[: DISCORD_CONTENT_LIMIT - 3] + "..."

    payload = json.dumps({"content": message}).encode("utf-8")
    request = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            if 200 <= status < 300:
                logger.info("discord.post: %r posted (HTTP %d)", channel, status)
                return True
            logger.warning("discord.post: %r returned HTTP %d", channel, status)
            return False
    except urllib.error.HTTPError as exc:
        logger.warning(
            "discord.post: %r HTTP error %d: %s", channel, exc.code, exc.reason
        )
        return False
    except urllib.error.URLError as exc:
        logger.warning("discord.post: %r URL error: %s", channel, exc.reason)
        return False
    except Exception:
        logger.warning("discord.post: %r unexpected error", channel, exc_info=True)
        return False
