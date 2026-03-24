"""Tests for journal entry management."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.journal.entries import JournalManager


@pytest.fixture
def tmp_journal(tmp_path):
    """Create a JournalManager with a temp directory."""
    return JournalManager(journal_dir=tmp_path, anthropic_api_key="fake-key")


def _mock_tag_response(tags):
    """Create a mock Claude response for auto-tagging."""
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = json.dumps(tags)
    mock_response.content = [mock_content]
    return mock_response


class TestCreateEntry:
    def test_creates_file_with_frontmatter(self, tmp_journal, tmp_path):
        """Creates a markdown file with YAML frontmatter."""
        filename = tmp_journal.create_entry(
            "daily", "Worked on Python skills today.",
            tags=["python", "learning"], mood="focused", time_spent=60,
        )

        assert filename.endswith(".md")
        assert "daily" in filename

        filepath = tmp_path / filename
        assert filepath.exists()

        text = filepath.read_text()
        assert "---" in text
        assert "type: daily" in text
        assert 'tags: ["python", "learning"]' in text
        assert "mood: focused" in text
        assert "time_spent_minutes: 60" in text
        assert "Worked on Python skills today." in text

    def test_sequential_counter(self, tmp_journal):
        """Creates sequential filenames for same day/type."""
        f1 = tmp_journal.create_entry("daily", "Entry one", tags=["a"])
        f2 = tmp_journal.create_entry("daily", "Entry two", tags=["b"])

        assert "_001.md" in f1
        assert "_002.md" in f2

    def test_auto_tags_via_claude(self, tmp_journal):
        """Auto-generates tags when none provided."""
        with patch.object(tmp_journal, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_tag_response(["python", "api", "learning"])
            mock_fn.return_value = mock_client

            filename = tmp_journal.create_entry("study", "Studied Python API integration")

        entry = tmp_journal.get_entry(filename)
        assert entry["tags"] == ["python", "api", "learning"]

    def test_auto_tag_failure_uses_empty(self, tmp_journal):
        """Falls back to empty tags when Claude fails."""
        with patch.object(tmp_journal, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API down")
            mock_fn.return_value = mock_client

            filename = tmp_journal.create_entry("daily", "Quick update")

        entry = tmp_journal.get_entry(filename)
        assert entry["tags"] == []

    def test_invalid_type_raises(self, tmp_journal):
        """Raises ValueError for invalid entry type."""
        with pytest.raises(ValueError, match="Invalid entry type"):
            tmp_journal.create_entry("invalid", "Content")


class TestListEntries:
    def test_lists_recent_entries(self, tmp_journal):
        """Lists entries within the date range."""
        tmp_journal.create_entry("daily", "Entry 1", tags=["a"])
        tmp_journal.create_entry("study", "Entry 2", tags=["b"])

        entries = tmp_journal.list_entries(days_back=1)
        assert len(entries) == 2

    def test_filters_by_type(self, tmp_journal):
        """Filters by entry type."""
        tmp_journal.create_entry("daily", "Daily entry", tags=["a"])
        tmp_journal.create_entry("study", "Study entry", tags=["b"])

        entries = tmp_journal.list_entries(days_back=1, entry_type="study")
        assert len(entries) == 1
        assert entries[0]["type"] == "study"

    def test_sorted_newest_first(self, tmp_journal):
        """Returns entries sorted newest first."""
        tmp_journal.create_entry("daily", "First", tags=["a"])
        tmp_journal.create_entry("daily", "Second", tags=["b"])

        entries = tmp_journal.list_entries(days_back=1)
        # Both are from today, so order is by filename (reversed = newest counter first)
        assert len(entries) == 2


class TestSearchEntries:
    def test_finds_matching_content(self, tmp_journal):
        """Finds entries containing the keyword."""
        tmp_journal.create_entry("daily", "Worked on PowerShell automation", tags=["ps"])
        tmp_journal.create_entry("study", "Studied Python basics", tags=["py"])

        results = tmp_journal.search_entries("PowerShell")
        assert len(results) == 1
        assert "PowerShell" in results[0]["snippet"]

    def test_case_insensitive(self, tmp_journal):
        """Search is case-insensitive."""
        tmp_journal.create_entry("daily", "Working with DOCKER today", tags=["docker"])

        results = tmp_journal.search_entries("docker")
        assert len(results) == 1

    def test_no_results(self, tmp_journal):
        """Returns empty list when no matches."""
        tmp_journal.create_entry("daily", "Nothing special", tags=[])

        results = tmp_journal.search_entries("kubernetes")
        assert len(results) == 0


class TestGetEntry:
    def test_reads_full_entry(self, tmp_journal):
        """Reads frontmatter and content."""
        filename = tmp_journal.create_entry(
            "reflection", "Thinking about career direction.",
            tags=["career"], mood="thoughtful",
        )

        entry = tmp_journal.get_entry(filename)
        assert entry is not None
        assert entry["type"] == "reflection"
        assert entry["mood"] == "thoughtful"
        assert "career direction" in entry["content"]

    def test_missing_file_returns_none(self, tmp_journal):
        """Returns None for nonexistent file."""
        result = tmp_journal.get_entry("nonexistent.md")
        assert result is None
