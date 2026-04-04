"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"

const supabase = createClient()

// Types matching Supabase schema
export interface TrainingCourse {
  id: string
  user_id: string
  course_code: string
  course_name: string
  domain: string | null
  provider: string | null
  status: string
  started_at: string | null
  target_exam_date: string | null
  completed_at: string | null
  total_modules: number
  total_sections: number
  completed_sections: number
  overall_progress: number
  vault_path: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TrainingProgress {
  id: string
  course_id: string
  user_id: string
  module_number: number
  module_title: string | null
  section_number: string
  section_title: string | null
  exam_weight: string | null
  completed: boolean
  completed_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  best_score: number | null
  weak_areas: string[]
  session_links: string[]
  next_review_at: string | null
  review_count: number
  created_at: string
  updated_at: string
}

export interface TrainingSession {
  id: string
  course_id: string
  user_id: string
  session_mode: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  sections_covered: string[]
  topics_covered: string[]
  quiz_results: Record<string, unknown> | null
  vault_path: string | null
  notes: string | null
  created_at: string
}

export interface TrainingResource {
  id: string
  course_id: string
  user_id: string
  title: string
  url: string | null
  resource_type: string | null
  section_number: string | null
  completed: boolean
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CourseDetail {
  progress: TrainingProgress[]
  sessions: TrainingSession[]
  resources: TrainingResource[]
}

/**
 * Fetch training_courses for the current user.
 * Read-only — all writes come from SecondBrain CLI.
 */
export function useTraining() {
  const [courses, setCourses] = useState<TrainingCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()

  const fetchCourses = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from("training_courses")
      .select("*")
      .eq("user_id", user.id)
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setCourses((data || []) as unknown as TrainingCourse[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    fetchCourses()
  }, [user, authLoading, fetchCourses])

  return { courses, loading, error, refetch: fetchCourses }
}

/**
 * Lazy-load detail data for a specific course.
 * Only fetches when enabled=true (CAR-99 pattern).
 */
export function useCourseDetail(courseId: string | null, enabled: boolean = false) {
  const [data, setData] = useState<CourseDetail>({
    progress: [],
    sessions: [],
    resources: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadCount, setLoadCount] = useState(0)
  const hasFetched = useRef(false)

  const refetch = useCallback(() => {
    hasFetched.current = false
    setLoadCount((c) => c + 1)
  }, [])

  // Reset fetch tracking when courseId changes
  useEffect(() => {
    hasFetched.current = false
    setData({ progress: [], sessions: [], resources: [] })
  }, [courseId])

  useEffect(() => {
    if (!courseId) {
      setData({ progress: [], sessions: [], resources: [] })
      setLoading(false)
      return
    }

    if (!enabled || hasFetched.current) {
      if (!enabled) setLoading(false)
      return
    }
    hasFetched.current = true

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const activeCourseId = courseId!
        const [progressRes, sessionsRes, resourcesRes] = await Promise.all([
          supabase
            .from("training_progress")
            .select("*")
            .eq("course_id", activeCourseId)
            .order("module_number", { ascending: true })
            .order("section_number", { ascending: true }),
          supabase
            .from("training_sessions")
            .select("*")
            .eq("course_id", activeCourseId)
            .order("started_at", { ascending: false })
            .limit(5),
          supabase
            .from("training_resources")
            .select("*")
            .eq("course_id", activeCourseId)
            .order("section_number", { ascending: true }),
        ])

        if (cancelled) return

        if (progressRes.error) throw progressRes.error
        if (sessionsRes.error) throw sessionsRes.error
        if (resourcesRes.error) throw resourcesRes.error

        setData({
          progress: (progressRes.data || []) as unknown as TrainingProgress[],
          sessions: (sessionsRes.data || []) as unknown as TrainingSession[],
          resources: (resourcesRes.data || []) as unknown as TrainingResource[],
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load course details")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [courseId, enabled, loadCount])

  return { ...data, loading, error, refetch }
}
