"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import type {
  CoachingSession,
  PracticeQuestion,
  QuestionAnalysis,
  PatternAnalysis,
} from "@/types"

export function useCoaching(applicationId: string) {
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [practicing, setPracticing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/coaching/analyze?applicationId=${applicationId}`)
      if (!resp.ok) return
      const data = await resp.json()
      setSessions(Array.isArray(data) ? data : [])
    } catch {
      // Silent — sessions will be populated as they're created
    } finally {
      setLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchSessions()
    }
  }, [fetchSessions])

  const analyzeDebrief = useCallback(
    async (notes: string, jobDescription?: string) => {
      setAnalyzing(true)
      setError(null)
      try {
        const resp = await fetch("/api/coaching/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId,
            sessionType: "debrief",
            rawInput: notes,
            jobDescription,
          }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Analysis failed")
        }
        const session: CoachingSession = await resp.json()
        setSessions((prev) => [session, ...prev])
        return session
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Analysis failed"
        setError(msg)
        return null
      } finally {
        setAnalyzing(false)
      }
    },
    [applicationId]
  )

  const startPractice = useCallback(
    async (jobDescription?: string) => {
      setPracticing(true)
      setError(null)
      try {
        const resp = await fetch("/api/coaching/practice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId, jobDescription }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Practice generation failed")
        }
        const data = await resp.json()
        return (data.questions || []) as PracticeQuestion[]
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Practice generation failed"
        setError(msg)
        return null
      } finally {
        setPracticing(false)
      }
    },
    [applicationId]
  )

  const evaluateAnswer = useCallback(
    async (question: string, answer: string, jobDescription?: string) => {
      setEvaluating(true)
      setError(null)
      try {
        const resp = await fetch("/api/coaching/practice-evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId, question, answer, jobDescription }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Evaluation failed")
        }
        const data = await resp.json()
        return data as { evaluation: QuestionAnalysis; patterns: PatternAnalysis }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Evaluation failed"
        setError(msg)
        return null
      } finally {
        setEvaluating(false)
      }
    },
    [applicationId]
  )

  // Aggregate stats across sessions (NO AI — pure math)
  const stats = useMemo(() => {
    if (sessions.length === 0) return null

    const scoreTrend = sessions
      .filter((s) => s.overall_score)
      .map((s) => ({ date: s.created_at, score: s.overall_score }))
      .reverse()

    const issueCounts = new Map<string, number>()
    for (const session of sessions) {
      const analyses = session.ai_analysis?.question_analyses || []
      for (const qa of analyses) {
        for (const issue of qa.issues || []) {
          issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1)
        }
      }
    }

    const commonIssues = Array.from(issueCounts.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)

    const recurringAreas = new Map<string, number>()
    for (const session of sessions) {
      for (const imp of session.improvements || []) {
        recurringAreas.set(imp.area, (recurringAreas.get(imp.area) || 0) + 1)
      }
    }

    const recurringImprovements = Array.from(recurringAreas.entries())
      .filter(([, count]) => count > 1)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)

    return { scoreTrend, commonIssues, recurringImprovements }
  }, [sessions])

  const latestSession = sessions.length > 0 ? sessions[0] : null

  return {
    sessions,
    latestSession,
    stats,
    loading,
    analyzing,
    practicing,
    evaluating,
    error,
    fetchSessions,
    analyzeDebrief,
    startPractice,
    evaluateAnswer,
  }
}
