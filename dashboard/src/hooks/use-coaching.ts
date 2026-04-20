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
  const [streamingText, setStreamingText] = useState<string>("")
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
      setStreamingText("")
      setError(null)
      try {
        const controller = new AbortController()
        const clientTimeout = setTimeout(() => controller.abort(), 305_000)

        let resp: Response
        try {
          resp = await fetch("/api/coaching/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              applicationId,
              sessionType: "debrief",
              rawInput: notes,
              jobDescription,
            }),
            signal: controller.signal,
          })
        } catch (err) {
          clearTimeout(clientTimeout)
          if (err instanceof Error && err.name === "AbortError") {
            throw new Error("Analysis timed out — the server may be overloaded. Please try again.")
          }
          throw err
        }

        if (!resp.ok) {
          clearTimeout(clientTimeout)
          const data = await resp.json()
          throw new Error(data.error || "Analysis failed")
        }

        // Consume SSE stream — server sends event: delta, event: done, event: error
        const reader = resp.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let session: CoachingSession | null = null

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""

            let currentEvent = ""
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith("data: ")) {
                const raw = line.slice(6).trim()
                let parsed: Record<string, unknown>
                try {
                  parsed = JSON.parse(raw)
                } catch {
                  continue
                }

                if (currentEvent === "delta" && typeof parsed.text === "string") {
                  setStreamingText((prev) => prev + parsed.text)
                } else if (currentEvent === "done") {
                  session = parsed as unknown as CoachingSession
                } else if (currentEvent === "error") {
                  throw new Error((parsed.error as string) || "Stream error")
                }
                currentEvent = ""
              }
            }
          }
        } finally {
          clearTimeout(clientTimeout)
          reader.releaseLock()
        }

        if (!session) {
          throw new Error("No session data received from stream")
        }

        setSessions((prev) => [session!, ...prev])
        return session
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Analysis failed"
        setError(msg)
        // Server may have completed and persisted even if the SSE connection dropped
        // before the client received event: done — refresh from DB to surface it
        fetchSessions()
        return null
      } finally {
        setAnalyzing(false)
        setStreamingText("")
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
    streamingText,
    practicing,
    evaluating,
    error,
    fetchSessions,
    analyzeDebrief,
    startPractice,
    evaluateAnswer,
  }
}
