"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DebriefRecord } from "@/types"

const supabase = createClient()

export function useDebriefs(applicationId: string) {
  const [debriefs, setDebriefs] = useState<DebriefRecord[]>([])
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

  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchDebriefs()
    }
  }, [fetchDebriefs])

  const addDebrief = useCallback((debrief: DebriefRecord) => {
    setDebriefs((prev) => [debrief, ...prev])
  }, [])

  return { debriefs, loading, fetchDebriefs, addDebrief }
}
