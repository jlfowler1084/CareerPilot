"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { AutoApplyQueueItem, AutoApplyStatus, FitScore, Job } from "@/types"

const supabase = createClient()

export function useAutoApplyQueue() {
  const [queue, setQueue] = useState<AutoApplyQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const { user, loading: authLoading } = useAuth()

  const fetchQueue = useCallback(async (statusFilter?: AutoApplyStatus) => {
    if (!user) { setLoading(false); return }

    let query = supabase
      .from("auto_apply_queue")
      .select("*")
      .eq("user_id", user.id)
      .order("fit_score", { ascending: false })

    if (statusFilter) {
      query = query.eq("status", statusFilter)
    }

    const { data } = await query
    setQueue(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    fetchQueue()

    // Real-time subscription
    const channel = supabase
      .channel("auto-apply-queue-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auto_apply_queue" },
        () => { fetchQueue() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchQueue, authLoading])

  const addToQueue = useCallback(async (job: Job, fitScore: FitScore) => {
    if (!user) return

    // Check for duplicates (same title + company)
    const existing = queue.find(
      (q) => q.job_title.toLowerCase() === job.title.toLowerCase() &&
             q.company.toLowerCase() === job.company.toLowerCase()
    )
    if (existing) return existing

    const item = {
      user_id: user.id,
      job_title: job.title,
      company: job.company,
      location: job.location || null,
      salary: job.salary || null,
      job_url: job.url || null,
      source: job.source || null,
      easy_apply: job.easyApply ?? false,
      fit_score: fitScore.total,
      score_breakdown: fitScore.breakdown,
      status: "pending" as AutoApplyStatus,
    }

    const { data, error } = await supabase
      .from("auto_apply_queue")
      .insert(item)
      .select()
      .single()

    if (!error && data) {
      setQueue((prev) => [data, ...prev])
    }
    return data
  }, [queue, user])

  const updateStatus = useCallback(async (id: string, status: AutoApplyStatus) => {
    const { error } = await supabase
      .from("auto_apply_queue")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (!error) {
      setQueue((prev) => prev.map((q) => q.id === id ? { ...q, status, updated_at: new Date().toISOString() } : q))
    }
  }, [])

  const approveJob = useCallback((id: string) => updateStatus(id, "approved"), [updateStatus])
  const rejectJob = useCallback((id: string) => updateStatus(id, "skipped"), [updateStatus])

  const approveAllAbove = useCallback(async (minScore: number) => {
    const toApprove = queue.filter((q) => q.status === "pending" && q.fit_score >= minScore)
    for (const item of toApprove) {
      await approveJob(item.id)
    }
  }, [queue, approveJob])

  const clearRejected = useCallback(async () => {
    const rejected = queue.filter((q) => q.status === "skipped" || q.status === "rejected")
    for (const item of rejected) {
      await supabase.from("auto_apply_queue").delete().eq("id", item.id)
    }
    setQueue((prev) => prev.filter((q) => q.status !== "skipped" && q.status !== "rejected"))
  }, [queue])

  const isInQueue = useCallback((job: { title: string; company: string }) => {
    return queue.some(
      (q) => q.job_title.toLowerCase() === job.title.toLowerCase() &&
             q.company.toLowerCase() === job.company.toLowerCase()
    )
  }, [queue])

  const counts = {
    pending: queue.filter((q) => q.status === "pending").length,
    approved: queue.filter((q) => q.status === "approved").length,
    applied: queue.filter((q) => q.status === "applied").length,
    failed: queue.filter((q) => q.status === "failed").length,
    total: queue.length,
  }

  return {
    queue, loading, counts,
    addToQueue, approveJob, rejectJob, approveAllAbove, clearRejected,
    updateStatus, isInQueue, refreshQueue: fetchQueue,
  }
}
