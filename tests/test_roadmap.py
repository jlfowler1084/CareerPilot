"""Tests for roadmap generation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.skills.roadmap import RoadmapGenerator


@pytest.fixture
def generator():
    return RoadmapGenerator()


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

        with patch("src.llm.router.router.complete", return_value=roadmap_text):
            result = generator.generate_roadmap(sample_gaps, available_hours_per_week=15)

        assert "Azure" in result
        assert "Docker" in result
        assert len(result) > 0

    def test_includes_hours_in_prompt(self, generator, sample_gaps):
        """Passes available hours to router prompt."""
        captured = {}

        def capture(task, prompt, **kw):
            captured["prompt"] = prompt
            return "Roadmap here"

        with patch("src.llm.router.router.complete", side_effect=capture):
            generator.generate_roadmap(sample_gaps, available_hours_per_week=10)

        assert "10 hours per week" in captured.get("prompt", "")

    def test_empty_gaps_returns_message(self, generator):
        """Returns a message when no gaps exist."""
        result = generator.generate_roadmap([], available_hours_per_week=15)
        assert "No skill gaps" in result

    def test_api_failure_returns_empty(self, generator, sample_gaps):
        """Returns empty string on router failure."""
        with patch("src.llm.router.router.complete", side_effect=Exception("API down")):
            result = generator.generate_roadmap(sample_gaps)

        assert result == ""

    def test_strips_markdown_bold(self, generator, sample_gaps):
        """Strips markdown bold formatting from output."""
        with patch("src.llm.router.router.complete", return_value="**Azure** is important"):
            result = generator.generate_roadmap(sample_gaps)

        assert "**" not in result
        assert "Azure is important" in result
