"""JSON schema validation using jsonschema."""

from __future__ import annotations

import jsonschema


def validate_against_schema(data, schema: dict) -> None:
    """Validate data against a JSON schema.

    Args:
        data: Parsed data (dict or list).
        schema: JSON Schema dict (draft-7 compatible).

    Raises:
        jsonschema.ValidationError: If validation fails.
    """
    jsonschema.validate(instance=data, schema=schema)
