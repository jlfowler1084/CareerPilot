"use client"

import { useState, useCallback, useMemo } from "react"
import type { Application, InterviewPrep, PrepStageKey, Debrief } from "@/types"

const PREP_STAGES: PrepStageKey[] = ["phone_screen", "interview", "offer"]

export function isPrepStage(status: string): status is PrepStageKey {
  return PREP_STAGES.includes(status as PrepStageKey)
}

export interface DebriefInput {
  round?: number
  rating: number
  questions_asked?: string
  went_well?: string
  challenging?: string
  takeaways?: string
  interviewer_name?: string
  interviewer_role?: string
}

export function useInterviewPrep(application: Application) {
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prep: InterviewPrep = application.interview_prep || {}

  const currentStagePrep = useMemo(() => {
    if (!isPrepStage(application.status)) return null
    return prep[application.status] || null
  }, [application.status, prep])

  const generatePrep = useCallback(
    async (stage: PrepStageKey) => {
      setGenerating(true)
      setError(null)
      try {
        const resp = await fetch("/api/interview-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: application.id, stage }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Generation failed")
        }
        return await resp.json()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Generation failed"
        setError(msg)
        return null
      } finally {
        setGenerating(false)
      }
    },
    [application.id]
  )

  const submitDebrief = useCallback(
    async (debrief: DebriefInput) => {
      setSubmitting(true)
      setError(null)
      try {
        const resp = await fetch("/api/interview-prep/debrief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: application.id, ...debrief }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Debrief submission failed")
        }
        return await resp.json()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Debrief submission failed"
        setError(msg)
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [application.id]
  )

  return { prep, currentStagePrep, generating, submitting, error, generatePrep, submitDebrief }
}

export function useSkillGaps(applications: Application[]) {
  const skills = useMemo(() => {
    const counts = new Map<string, number>()
    const activeStatuses = ["phone_screen", "interview", "offer"]

    for (const app of applications) {
      if (!activeStatuses.includes(app.status)) continue
      const prep = app.interview_prep || {}
      for (const stage of PREP_STAGES) {
        const stagePrep = prep[stage]
        if (!stagePrep?.content) continue
        const content = stagePrep.content as { skills_to_study?: string[] }
        if (!content.skills_to_study) continue
        for (const skill of content.skills_to_study) {
          const normalized = skill.toLowerCase().trim()
          counts.set(normalized, (counts.get(normalized) || 0) + 1)
        }
      }
    }

    return Array.from(counts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [applications])

  return { skills, loading: false as const }
}
