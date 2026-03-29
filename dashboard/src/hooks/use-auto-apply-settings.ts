"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export interface AutoApplySettings {
  id: string
  user_id: string
  enabled: boolean
  auto_approve_threshold: number
  manual_review_threshold: number
  max_daily_applications: number
  max_batch_size: number
  easy_apply_only: boolean
  preferred_sources: string[]
  excluded_companies: string[]
  min_salary: number
  require_cover_letter: boolean
  auto_generate_materials: boolean
  created_at: string
  updated_at: string
}

export function useAutoApplySettings() {
  const [settings, setSettings] = useState<AutoApplySettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      let { data } = await supabase
        .from("auto_apply_settings")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (!data) {
        const { data: newSettings } = await supabase
          .from("auto_apply_settings")
          .insert({ user_id: user.id })
          .select()
          .single()
        data = newSettings
      }

      setSettings(data)
      setLoading(false)
    }
    fetchSettings()
  }, [])

  const updateSettings = useCallback(async (updates: Partial<AutoApplySettings>) => {
    if (!settings) return

    // Optimistic update
    const prev = settings
    setSettings({ ...settings, ...updates, updated_at: new Date().toISOString() })

    const { error } = await supabase
      .from("auto_apply_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", settings.id)

    if (error) {
      setSettings(prev) // revert
    }
  }, [settings])

  return { settings, updateSettings, loading }
}
