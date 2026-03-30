"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { RESPONSE_STATUSES } from "@/lib/constants"
import { logActivity } from "@/hooks/use-activity-log"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import type { Application, ApplicationStatus, ApplicationEventType, ExtractedJob, Job } from "@/types"

const supabase = createClient()

async function insertApplicationEvent(
  userId: string,
  applicationId: string,
  eventType: ApplicationEventType,
  description: string,
  previousValue?: string | null,
  newValue?: string | null
) {
  await supabase.from("application_events").insert({
    application_id: applicationId,
    user_id: userId,
    event_type: eventType,
    description,
    previous_value: previousValue ?? null,
    new_value: newValue ?? null,
  })
}

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
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    const fetchApps = async () => {
      const { data } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id)
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
  }, [user, authLoading])

  const addApplication = useCallback(
    async (
      job: Partial<Application> | Job,
      entryPoint: "search" | "manual" = "manual"
    ) => {
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
          tailored_resume: "tailored_resume" in job ? (job as Partial<Application>).tailored_resume ?? null : null,
          cover_letter: "cover_letter" in job ? (job as Partial<Application>).cover_letter ?? null : null,
        })
        .select()
        .single()

      if (error) {
        toast.error("Failed to track application")
      }

      if (!error && data) {
        toast.success(`Application tracked: ${data.title}`)
        await logActivity(user.id, `Tracked: ${data.title} at ${data.company}`)

        if (data.tailored_resume) {
          await insertApplicationEvent(
            user.id,
            data.id,
            "resume_tailored",
            `Resume tailored for ${data.title} at ${data.company}`
          )
        }
      }

      return { data, error }
    },
    [user]
  )

  const updateApplication = useCallback(
    async (id: string, updates: Partial<Application>) => {
      const current = applications.find((a) => a.id === id)

      // Compute automatic date fields
      if (updates.status && current) {
        const dateUpdates = computeDateUpdates(
          updates.status,
          current.date_applied,
          current.date_response
        )
        Object.assign(updates, dateUpdates)
      }

      // Optimistic update — apply immediately, revert on failure
      if (current) {
        setApplications((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
        )
      }

      const { data, error } = await supabase
        .from("applications")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) {
        // Revert optimistic update
        if (current) {
          setApplications((prev) =>
            prev.map((a) => (a.id === id ? current : a))
          )
        }
        toast.error("Failed to update application")
      }

      if (!error && data) {
        if (updates.status) {
          toast.success(`Status updated to ${updates.status}`)
        }
        const statusLabel = updates.status
          ? ` → ${updates.status}`
          : ""
        if (user) await logActivity(user.id, `Updated: ${data.title}${statusLabel}`)

        // Log status change event
        if (updates.status && current && updates.status !== current.status) {
          await insertApplicationEvent(
            user?.id ?? "",
            id,
            "status_change",
            `Status changed from ${current.status} to ${updates.status}`,
            current.status,
            updates.status
          )
        }

        // Log resume tailored event
        if (updates.tailored_resume && !current?.tailored_resume) {
          await insertApplicationEvent(
            user?.id ?? "",
            id,
            "resume_tailored",
            `Resume tailored for ${data.title} at ${data.company}`
          )
        }

        // Log cover letter generated event
        if (updates.cover_letter && !current?.cover_letter) {
          await insertApplicationEvent(
            user?.id ?? "",
            id,
            "cover_letter_generated",
            `Cover letter generated for ${data.title} at ${data.company}`
          )
        }

        // Log calendar scheduled event
        if (updates.calendar_event_id && !current?.calendar_event_id) {
          await insertApplicationEvent(
            user?.id ?? "",
            id,
            "calendar_scheduled",
            `Calendar event scheduled for ${data.title}`
          )
        }
      }

      return { data, error }
    },
    [applications, user]
  )

  const deleteApplication = useCallback(async (id: string) => {
    const app = applications.find((a) => a.id === id)
    const { error } = await supabase.from("applications").delete().eq("id", id)
    if (error) {
      toast.error("Failed to delete application")
    } else {
      toast.success("Application deleted")
      if (app && user) {
        await logActivity(user.id, `Removed: ${app.title} at ${app.company}`)
      }
    }
  }, [applications, user])

  const createFromExtraction = useCallback(
    async (extracted: ExtractedJob, url: string) => {
      if (!user) return { data: null, error: "Not authenticated" }

      const { data, error } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          title: extracted.title,
          company: extracted.company,
          location: extracted.location,
          url,
          source: extracted.source,
          salary_range: extracted.salary_range,
          status: "interested" as ApplicationStatus,
          job_type: extracted.job_type,
          posted_date: extracted.posted_date,
          job_description: extracted.job_description,
          contact_name: extracted.contact_name,
          contact_email: extracted.contact_email,
          profile_id: "",
          notes: "",
        })
        .select()
        .single()

      if (!error && data) {
        await logActivity(user.id, `Tracked: ${data.title} at ${data.company}`)
        await insertApplicationEvent(
          user.id,
          data.id,
          "tracked",
          `Imported from ${extracted.source} via URL extraction`
        )
      }

      return { data, error }
    },
    [user]
  )

  const updateContact = useCallback(
    async (
      id: string,
      contact: Pick<Application, "contact_name" | "contact_email" | "contact_phone" | "contact_role">
    ) => {
      const { data, error } = await supabase
        .from("applications")
        .update(contact)
        .eq("id", id)
        .select()
        .single()

      if (error) {
        toast.error("Failed to save contact info")
      }
      if (!error && data) {
        toast.success("Contact info saved")
        await insertApplicationEvent(
          user?.id ?? "",
          id,
          "contact_added",
          `Contact info updated: ${contact.contact_name || "unnamed"}`
        )
      }

      return { data, error }
    },
    []
  )

  const updateNotes = useCallback(
    async (id: string, notes: string) => {
      const { data, error } = await supabase
        .from("applications")
        .update({ notes })
        .eq("id", id)
        .select()
        .single()

      if (error) {
        toast.error("Failed to save notes")
      }
      if (!error && data) {
        toast.success("Notes saved")
        await insertApplicationEvent(
          user?.id ?? "",
          id,
          "note_added",
          "Notes updated"
        )
      }

      return { data, error }
    },
    []
  )

  const updateJobDescription = useCallback(
    async (id: string, job_description: string) => {
      const { data, error } = await supabase
        .from("applications")
        .update({ job_description })
        .eq("id", id)
        .select()
        .single()

      return { data, error }
    },
    []
  )

  return {
    applications,
    loading,
    addApplication,
    createFromExtraction,
    updateApplication,
    deleteApplication,
    updateContact,
    updateNotes,
    updateJobDescription,
  }
}
