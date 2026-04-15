"""Claude-powered interview analysis, comparison, and mock coaching."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from src.db import models

logger = logging.getLogger(__name__)

MOCK_QUESTION_PROMPT = """\
You are an interviewer conducting a technical/behavioral interview for this role:

{role_description}

Generate ONE interview question. This is question {question_num} of {total_questions}.
{previous_context}

Vary question types: mix technical, behavioral (STAR), situational, and problem-solving.
Return ONLY the question text, nothing else."""

MOCK_EVALUATE_PROMPT = """\
You are an interview coach evaluating a candidate's response.

Role: {role_description}
Question: {question}
Candidate's answer: {answer}

Evaluate the response and return a JSON object:
{{
  "rating": 3,
  "strengths": "what was good about the answer",
  "weaknesses": "what could be improved",
  "ideal_answer_points": ["key points an ideal answer would include"]
}}

Ratings are 1-5. Return ONLY valid JSON, no markdown fences."""

MOCK_SUMMARY_PROMPT = """\
You are an interview coach providing a final assessment after a mock interview.

Role: {role_description}

Here are the questions, answers, and per-question evaluations:
{qa_summary}

Provide a final assessment as JSON:
{{
  "overall_score": 7,
  "overall_justification": "brief justification",
  "top_improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "practice_questions": ["5 targeted follow-up questions based on weak areas"],
  "technical_gaps": ["specific technologies or concepts to study"]
}}

Return ONLY valid JSON, no markdown fences."""


class InterviewCoach:
    """Claude-powered interview analysis, comparison, and mock coaching."""

    def __init__(self, db_path: Path = None):
        self._db_path = db_path
        self._conn = None

    def _get_conn(self):
        if self._conn is None:
            self._conn = models.get_connection(self._db_path)
        return self._conn

    def analyze_interview(
        self,
        transcript_turns: List[Dict],
        job_title: str = None,
        company: str = None,
    ) -> Optional[Dict]:
        """Analyze an interview transcript using Claude.

        Args:
            transcript_turns: List of {speaker, text, timestamp} dicts.
            job_title: Optional job title for context.
            company: Optional company name for context.

        Returns:
            Structured analysis dict, or None on failure.
        """
        # Format turns into readable transcript
        transcript_text = self._format_turns(transcript_turns)

        context_parts = []
        if job_title:
            context_parts.append(f"Role: {job_title}")
        if company:
            context_parts.append(f"Company: {company}")
        context = "\n".join(context_parts)

        user_message = f"{context}\n\nTranscript:\n{transcript_text}" if context else f"Transcript:\n{transcript_text}"

        try:
            from src.llm.router import router
            result = router.complete(
                task="interview_transcript_analyze",
                prompt=user_message[:30000],
            )
            if result:
                result.setdefault("questions_asked", [])
                result.setdefault("response_quality", [])
                result.setdefault("technical_gaps", [])
                result.setdefault("behavioral_assessment", {})
                result.setdefault("overall_score", 0)
                result.setdefault("overall_justification", "")
                result.setdefault("top_improvements", [])
                result.setdefault("practice_questions", [])
            return result
        except Exception:
            logger.error("Interview analysis failed", exc_info=True)
            return None

    def compare_interviews(self, analyses: List[Dict] = None) -> Optional[Dict]:
        """Compare multiple past analyses to identify trends.

        Args:
            analyses: List of analysis dicts. If None, loads all from SQLite.

        Returns:
            Comparison dict, or None if fewer than 2 analyses or on failure.
        """
        if analyses is None:
            analyses = self.get_all_analyses()

        if len(analyses) < 2:
            logger.warning("Need at least 2 analyses to compare, got %d", len(analyses))
            return None

        # Build summary for Claude
        summaries = []
        for i, a in enumerate(analyses, 1):
            analysis_data = a.get("analysis", a)
            if isinstance(analysis_data, str):
                analysis_data = json.loads(analysis_data)
            meta = ""
            if a.get("company"):
                meta += f" at {a['company']}"
            if a.get("role"):
                meta += f" for {a['role']}"
            if a.get("analyzed_at"):
                meta += f" ({a['analyzed_at'][:10]})"

            summaries.append(
                f"Interview {i}{meta}:\n"
                f"  Score: {analysis_data.get('overall_score', '?')}/10\n"
                f"  Gaps: {', '.join(analysis_data.get('technical_gaps', []))}\n"
                f"  Improvements: {', '.join(analysis_data.get('top_improvements', []))}"
            )

        user_message = "\n\n".join(summaries)

        try:
            from src.llm.router import router
            result = router.complete(task="interview_compare", prompt=user_message)
            if result:
                result.setdefault("recurring_weak_topics", [])
                result.setdefault("improved_skills", [])
                result.setdefault("persistent_gaps", [])
                result.setdefault("trajectory", "unknown")
                result.setdefault("trajectory_explanation", "")
                result.setdefault("recommendations", [])
            return result
        except Exception:
            logger.error("Interview comparison failed", exc_info=True)
            return None

    def mock_interview(
        self,
        role_description: str,
        num_questions: int = 5,
        input_fn=None,
        output_fn=None,
    ) -> Optional[Dict]:
        """Run an interactive mock interview session.

        Args:
            role_description: Description of the target role.
            num_questions: Number of questions to ask.
            input_fn: Callable for getting user input (for testing). Defaults to input().
            output_fn: Callable for displaying output (for testing). Defaults to print().

        Returns:
            Final assessment dict, or None on failure.
        """
        if input_fn is None:
            input_fn = input
        if output_fn is None:
            output_fn = print

        from src.llm.router import router
        qa_pairs = []

        for q_num in range(1, num_questions + 1):
            # Build context from previous Q&A
            previous_context = ""
            if qa_pairs:
                prev_lines = []
                for qa in qa_pairs:
                    prev_lines.append(f"Q: {qa['question']}")
                    prev_lines.append(f"A: {qa['answer']}")
                previous_context = (
                    "Previous questions and answers (don't repeat topics):\n"
                    + "\n".join(prev_lines)
                )

            # Generate question
            try:
                question = router.complete(
                    task="interview_question_gen",
                    prompt=MOCK_QUESTION_PROMPT.format(
                        role_description=role_description,
                        question_num=q_num,
                        total_questions=num_questions,
                        previous_context=previous_context,
                    ),
                )
            except Exception:
                logger.error("Failed to generate question %d", q_num, exc_info=True)
                return None

            # Display question and get answer
            output_fn(f"\n--- Question {q_num}/{num_questions} ---")
            output_fn(question)
            output_fn("")

            answer = input_fn("Your answer: ")
            if not answer.strip():
                answer = "(no answer provided)"

            # Evaluate response
            try:
                evaluation = router.complete(
                    task="interview_answer_eval",
                    prompt=MOCK_EVALUATE_PROMPT.format(
                        role_description=role_description,
                        question=question,
                        answer=answer,
                    ),
                )
            except Exception:
                logger.error("Failed to evaluate answer %d", q_num, exc_info=True)
                evaluation = None

            if evaluation is None:
                evaluation = {
                    "rating": 0,
                    "strengths": "Evaluation failed",
                    "weaknesses": "Evaluation failed",
                    "ideal_answer_points": [],
                }

            qa_pairs.append({
                "question": question,
                "answer": answer,
                "evaluation": evaluation,
            })

            # Show per-question feedback
            output_fn(f"Rating: {evaluation.get('rating', '?')}/5")
            output_fn(f"Strengths: {evaluation.get('strengths', '')}")
            output_fn(f"Weaknesses: {evaluation.get('weaknesses', '')}")

        # Generate final assessment
        qa_summary = "\n\n".join(
            f"Q{i+1}: {qa['question']}\n"
            f"A: {qa['answer']}\n"
            f"Rating: {qa['evaluation'].get('rating', '?')}/5\n"
            f"Strengths: {qa['evaluation'].get('strengths', '')}\n"
            f"Weaknesses: {qa['evaluation'].get('weaknesses', '')}"
            for i, qa in enumerate(qa_pairs)
        )

        try:
            assessment = router.complete(
                task="interview_summary",
                prompt=MOCK_SUMMARY_PROMPT.format(
                    role_description=role_description,
                    qa_summary=qa_summary,
                ),
            )
        except Exception:
            logger.error("Failed to generate final assessment", exc_info=True)
            assessment = None

        if assessment is None:
            assessment = {
                "overall_score": 0,
                "overall_justification": "Assessment generation failed",
                "top_improvements": [],
                "practice_questions": [],
                "technical_gaps": [],
            }

        assessment["qa_pairs"] = qa_pairs
        return assessment

    def save_analysis(
        self,
        transcript_file: str,
        analysis: Dict,
        company: str = "",
        role: str = "",
    ) -> int:
        """Store an analysis in SQLite.

        Returns:
            The row id of the inserted analysis.
        """
        conn = self._get_conn()
        cursor = conn.execute(
            "INSERT INTO interview_analyses (transcript_file, analysis_json, analyzed_at, company, role) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                transcript_file,
                json.dumps(analysis),
                datetime.now().isoformat(),
                company,
                role,
            ),
        )
        conn.commit()
        logger.info("Saved analysis for %s (id=%d)", transcript_file, cursor.lastrowid)
        return cursor.lastrowid

    def get_all_analyses(self) -> List[Dict]:
        """Retrieve all stored analyses from SQLite."""
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM interview_analyses ORDER BY analyzed_at DESC"
        ).fetchall()
        results = []
        for row in rows:
            d = dict(row)
            try:
                d["analysis"] = json.loads(d["analysis_json"])
            except (json.JSONDecodeError, KeyError):
                d["analysis"] = {}
            results.append(d)
        return results

    def get_analysis(self, analysis_id: int) -> Optional[Dict]:
        """Retrieve a single analysis by id."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM interview_analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["analysis"] = json.loads(d["analysis_json"])
        except (json.JSONDecodeError, KeyError):
            d["analysis"] = {}
        return d

    def close(self):
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    @staticmethod
    def _format_turns(turns: List[Dict]) -> str:
        """Format transcript turns into readable text."""
        lines = []
        for turn in turns:
            ts = f"[{turn['timestamp']}] " if turn.get("timestamp") else ""
            lines.append(f"{ts}{turn['speaker']}: {turn['text']}")
        return "\n\n".join(lines)
