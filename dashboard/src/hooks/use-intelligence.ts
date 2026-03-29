"use client"

import { useEffect, useState, useCallback } from "react"
import type {
  CompanyBriefRow,
  InterviewPrepRow,
  DebriefRow,
  SkillMentionRow,
} from "@/lib/intelligence/supabase-helpers"

interface IntelligenceData {
  brief: CompanyBriefRow | null
  preps: InterviewPrepRow[]
  debriefs: DebriefRow[]
  skillMentions: SkillMentionRow[]
}

export function useIntelligence(applicationId: string | null) {
  const [data, setData] = useState<IntelligenceData>({
    brief: null,
    preps: [],
    debriefs: [],
    skillMentions: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadCount, setLoadCount] = useState(0)

  const refetch = useCallback(() => setLoadCount((c) => c + 1), [])

  useEffect(() => {
    if (!applicationId) {
      setData({ brief: null, preps: [], debriefs: [], skillMentions: [] })
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const resp = await fetch(`/api/intelligence/${applicationId}`)
        if (cancelled) return

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}))
          setError(body.error || `Failed to load intelligence data`)
          setLoading(false)
          return
        }

        const json = await resp.json()
        if (cancelled) return

        setData({
          brief: json.brief ?? null,
          preps: json.preps ?? [],
          debriefs: json.debriefs ?? [],
          skillMentions: json.skill_mentions ?? [],
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [applicationId, loadCount])

  const hasData = !!(data.brief || data.preps.length || data.debriefs.length)

  return { ...data, hasData, loading, error, refetch }
}
