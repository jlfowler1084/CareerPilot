"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DebriefRecord } from "@/types"

const supabase = createClient()

interface StructuredDebriefInput {
  applicationId: string
  stage: string
  went_well: string
  was_hard: string
  do_differently: string
  key_takeaways: string[]
  interviewer_names: string[]
  topics_covered: string[]
  overall_rating: number
}

export function useDebriefs(applicationId: string) {
  const [debriefs, setDebriefs] = useState<DebriefRecord[]>([])
  const [allUserDebriefs, setAllUserDebriefs] = useState<DebriefRecord[]>([])
  const [loading, setLoading] = useState(true)
  const hasFetched = useRef(false)

  const fetchDebriefs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("debriefs")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setDebriefs(data as unknown as DebriefRecord[])
    }
    setLoading(false)
  }, [applicationId])

  const fetchAllUserDebriefs = useCallback(async () => {
    const { data } = await supabase
      .from("debriefs")
      .select("*")
      .order("created_at", { ascending: false })

    if (data) {
      setAllUserDebriefs(data as unknown as DebriefRecord[])
    }
  }, [])

  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchDebriefs()
      fetchAllUserDebriefs()
    }
  }, [fetchDebriefs, fetchAllUserDebriefs])

  const addDebrief = useCallback((debrief: DebriefRecord) => {
    setDebriefs((prev) => [debrief, ...prev])
    setAllUserDebriefs((prev) => [debrief, ...prev])
  }, [])

  const saveStructuredDebrief = useCallback(async (input: StructuredDebriefInput): Promise<DebriefRecord | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from("debriefs")
      .insert({
        application_id: input.applicationId,
        user_id: user.id,
        stage: input.stage,
        went_well: input.went_well || null,
        was_hard: input.was_hard || null,
        do_differently: input.do_differently || null,
        key_takeaways: input.key_takeaways.length > 0 ? input.key_takeaways : null,
        interviewer_names: input.interviewer_names.length > 0 ? input.interviewer_names : null,
        topics_covered: input.topics_covered.length > 0 ? input.topics_covered : null,
        overall_rating: input.overall_rating || null,
        ai_analysis: null,
        model_used: null,
        generation_cost_cents: 0,
      })
      .select()
      .single()

    if (error || !data) {
      console.error("Failed to save debrief:", error?.message)
      return null
    }

    const debrief = data as unknown as DebriefRecord
    addDebrief(debrief)
    return debrief
  }, [addDebrief])

  const updateDebriefAnalysis = useCallback((debriefId: string, analysis: Record<string, unknown>) => {
    const update = (prev: DebriefRecord[]) =>
      prev.map((d) => d.id === debriefId ? { ...d, ai_analysis: analysis as unknown as DebriefRecord["ai_analysis"] } : d)
    setDebriefs(update)
    setAllUserDebriefs(update)
  }, [])

  return { debriefs, allUserDebriefs, loading, fetchDebriefs, addDebrief, saveStructuredDebrief, updateDebriefAnalysis }
}
