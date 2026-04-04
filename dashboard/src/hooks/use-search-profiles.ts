"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { DEFAULT_SEARCH_PROFILES } from "@/lib/constants"

const supabase = createClient()

export interface SearchProfile {
  id: string
  name: string
  keyword: string
  location: string
  source: "dice" | "indeed" | "both" | "dice_contract"
  icon: string
  is_default: boolean
  sort_order: number
}

type CreateProfileInput = Omit<SearchProfile, "id" | "is_default" | "sort_order">

export function useSearchProfiles() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([])
  const [loading, setLoading] = useState(true)
  // Ref to avoid profiles dependency in callbacks, preventing infinite re-creation (CAR-115 Bug 4)
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles

  const fetchProfiles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("search_profiles")
        .select("*")
        .order("sort_order", { ascending: true })

      if (error || !data || data.length === 0) {
        // Fallback to hardcoded defaults
        setProfiles(
          DEFAULT_SEARCH_PROFILES.map((p, i) => ({
            id: p.id,
            name: p.label,
            keyword: p.keyword,
            location: p.location,
            source: p.source,
            icon: p.icon,
            is_default: true,
            sort_order: i,
          }))
        )
      } else {
        setProfiles(data as SearchProfile[])
      }
    } catch {
      // Network error — use fallback
      setProfiles(
        DEFAULT_SEARCH_PROFILES.map((p, i) => ({
          id: p.id,
          name: p.label,
          keyword: p.keyword,
          location: p.location,
          source: p.source,
          icon: p.icon,
          is_default: true,
          sort_order: i,
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  const createProfile = useCallback(
    async (input: CreateProfileInput) => {
      const maxSort = profilesRef.current.reduce((max, p) => Math.max(max, p.sort_order), 0)
      const newProfile: Partial<SearchProfile> = {
        name: input.name,
        keyword: input.keyword,
        location: input.location,
        source: input.source,
        icon: input.icon,
        is_default: false,
        sort_order: maxSort + 1,
      }

      // Optimistic update
      const optimisticId = `temp_${Date.now()}`
      const optimistic: SearchProfile = {
        ...newProfile,
        id: optimisticId,
        is_default: false,
        sort_order: maxSort + 1,
      } as SearchProfile
      setProfiles((prev) => [...prev, optimistic])

      const { data, error } = await supabase
        .from("search_profiles")
        .insert(newProfile)
        .select()
        .single()

      if (error || !data) {
        // Roll back optimistic update
        setProfiles((prev) => prev.filter((p) => p.id !== optimisticId))
        return
      }

      // Replace optimistic with real
      setProfiles((prev) =>
        prev.map((p) => (p.id === optimisticId ? (data as SearchProfile) : p))
      )
    },
    []
  )

  const updateProfile = useCallback(
    async (id: string, updates: Partial<SearchProfile>) => {
      // Optimistic update
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      )

      const { error } = await supabase
        .from("search_profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)

      if (error) {
        // Revert on failure
        await fetchProfiles()
      }
    },
    [fetchProfiles]
  )

  const deleteProfile = useCallback(
    async (id: string) => {
      const target = profilesRef.current.find((p) => p.id === id)
      if (!target || target.is_default) return

      // Optimistic update
      setProfiles((prev) => prev.filter((p) => p.id !== id))

      const { error } = await supabase
        .from("search_profiles")
        .delete()
        .eq("id", id)

      if (error) {
        await fetchProfiles()
      }
    },
    [fetchProfiles]
  )

  const refreshProfiles = useCallback(async () => {
    setLoading(true)
    await fetchProfiles()
  }, [fetchProfiles])

  return {
    profiles,
    loading,
    createProfile,
    updateProfile,
    deleteProfile,
    refreshProfiles,
  }
}
