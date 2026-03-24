"""Tests for roadmap generation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.skills.roadmap import RoadmapGenerator


@pytest.fixture
def generator():
    return RoadmapGenerator(anthropic_api_key="fake-key")


@pytest.fixture
def sample_gaps():
    return [
        {"name": "Azure", "category": "cloud", "current_level": 2, "target_level": 4, "gap": 2},
        {"name": "Docker", "category": "containers", "current_level": 1, "target_level": 3, "gap": 2},
        {"name": "Python", "category": "development", "current_level": 2, "target_level": 4, "gap": 2},
    ]


def _mock_claude_response(text):
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = text
    mock_response.content = [mock_content]
    return mock_response


class TestGenerateRoadmap:
    def test_generates_roadmap(self, generator, sample_gaps):
        """Generates a roadmap from skill gaps."""
        roadmap_text = (
            "Week 1-2: Azure Fundamentals\n"
            "- Resource: Microsoft Learn AZ-900 path\n"
            "- Project: Deploy a VM with Terraform\n\n"
            "Week 3-4: Docker\n"
            "- Resource: Docker official getting started\n"
            "- Project: Containerize CareerPilot"
        )

        with patch.object(generator, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(roadmap_text)
            mock_fn.return_value = mock_client

            result = generator.generate_roadmap(sample_gaps, available_hours_per_week=15)

        assert "Azure" in result
        assert "Docker" in result
        assert len(result) > 0

    def test_includes_hours_in_prompt(self, generator, sample_gaps):
        """Passes available hours to Claude prompt."""
        with patch.object(generator, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response("Roadmap here")
            mock_fn.return_value = mock_client

            generator.generate_roadmap(sample_gaps, available_hours_per_week=10)

        call_kwargs = mock_client.messages.create.call_args[1]
        assert "10 hours per week" in call_kwargs["messages"][0]["content"]

    def test_empty_gaps_returns_message(self, generator):
        """Returns a message when no gaps exist."""
        result = generator.generate_roadmap([], available_hours_per_week=15)
        assert "No skill gaps" in result

    def test_api_failure_returns_empty(self, generator, sample_gaps):
        """Returns empty string on API failure."""
        with patch.object(generator, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API down")
            mock_fn.return_value = mock_client

            result = generator.generate_roadmap(sample_gaps)

        assert result == ""

    def test_strips_markdown_bold(self, generator, sample_gaps):
        """Strips markdown bold formatting from output."""
        with patch.object(generator, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response("**Azure** is important")
            mock_fn.return_value = mock_client

            result = generator.generate_roadmap(sample_gaps)

        assert "**" not in result
        assert "Azure is important" in result
