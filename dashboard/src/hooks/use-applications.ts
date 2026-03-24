"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { RESPONSE_STATUSES } from "@/lib/constants"
import { logActivity } from "@/hooks/use-activity-log"
import type { Application, ApplicationStatus, Job } from "@/types"

const supabase = createClient()

function computeDateUpdates(
  newStatus: ApplicationStatus,
  currentDateApplied: string | null,
  currentDateResponse: string | null
): Record<string, string> {
  const updates: Record<string, string> = {}
  if (newStatus === "applied" && !currentDateApplied) {
    updates.date_applied = new Date().toISOString()
  }
  if (RESPONSE_STATUSES.includes(newStatus) && !currentDateResponse) {
    updates.date_response = new Date().toISOString()
  }
  return updates
}

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchApps = async () => {
      const { data } = await supabase
        .from("applications")
        .select("*")
        .order("date_found", { ascending: false })

      setApplications(data || [])
      setLoading(false)
    }
    fetchApps()

    // Real-time subscription
    const channel = supabase
      .channel("applications-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setApplications((prev) => [payload.new as Application, ...prev])
          } else if (payload.eventType === "UPDATE") {
            setApplications((prev) =>
              prev.map((a) =>
                a.id === (payload.new as Application).id
                  ? (payload.new as Application)
                  : a
              )
            )
          } else if (payload.eventType === "DELETE") {
            setApplications((prev) =>
              prev.filter((a) => a.id !== (payload.old as Application).id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const addApplication = useCallback(
    async (
      job: Partial<Application> | Job,
      entryPoint: "search" | "manual" = "manual"
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const status = entryPoint === "search" ? "interested" : "found"

      const { data, error } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          title: "title" in job ? job.title : "",
          company: "company" in job ? job.company : "",
          location: "location" in job ? job.location : null,
          url: "url" in job ? job.url : null,
          source: "source" in job ? job.source : null,
          salary_range:
            "salary_range" in job
              ? job.salary_range
              : "salary" in job
                ? (job as Job).salary
                : null,
          status,
          job_type: "type" in job ? (job as Job).type : ("job_type" in job ? job.job_type : null),
          posted_date: "posted" in job ? (job as Job).posted : ("posted_date" in job ? job.posted_date : null),
          profile_id:
            "profileId" in job
              ? (job as Job).profileId
              : "profile_id" in job
                ? job.profile_id
                : "",
          notes: "",
        })
        .select()
        .single()

      if (!error && data) {
        await logActivity(`Tracked: ${data.title} at ${data.company}`)
      }

      return { data, error }
    },
    []
  )

  const updateApplication = useCallback(
    async (id: string, updates: Partial<Application>) => {
      // Compute automatic date fields
      if (updates.status) {
        const current = applications.find((a) => a.id === id)
        if (current) {
          const dateUpdates = computeDateUpdates(
            updates.status,
            current.date_applied,
            current.date_response
          )
          Object.assign(updates, dateUpdates)
        }
      }

      const { data, error } = await supabase
        .from("applications")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (!error && data) {
        const statusLabel = updates.status
          ? ` → ${updates.status}`
          : ""
        await logActivity(`Updated: ${data.title}${statusLabel}`)
      }

      return { data, error }
    },
    [applications]
  )

  const deleteApplication = useCallback(async (id: string) => {
    const app = applications.find((a) => a.id === id)
    await supabase.from("applications").delete().eq("id", id)
    if (app) {
      await logActivity(`Removed: ${app.title} at ${app.company}`)
    }
  }, [applications])

  return { applications, loading, addApplication, updateApplication, deleteApplication }
}
