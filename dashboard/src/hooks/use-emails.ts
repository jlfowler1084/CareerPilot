"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { extractDomain, extractPreview } from "@/lib/gmail/parse"
import { findDomainMatch } from "@/lib/gmail/suggestions"
import type { Email, EmailApplicationLink, ClassificationResult, Application, ApplicationStatus } from "@/types"

const supabase = createClient()
const SCAN_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 1000
const MAX_CLASSIFY_ATTEMPTS = 3
const STATUS_UPDATE_WINDOW_DAYS = 90

const CATEGORY_TO_STATUS: Record<string, ApplicationStatus> = {
  rejection: "rejected",
  interview_request: "interview",
  offer: "offer",
}

const COMPANY_NOISE = /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|company|co\.?|group|holdings|technologies|technology|solutions|services|enterprises?)\b/gi

function normalizeCompany(name: string): string {
  return name.replace(COMPANY_NOISE, "").replace(/[.,\-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
}

function fuzzyCompanyMatch(emailCompany: string, appCompany: string): boolean {
  const a = normalizeCompany(emailCompany)
  const b = normalizeCompany(appCompany)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

interface ScanState {
  scanning: boolean
  classifying: boolean
  classified: number
  total: number
  lastScan: string | null
}

export function useEmails() {
  const [emails, setEmails] = useState<Email[]>([])
  const [links, setLinks] = useState<EmailApplicationLink[]>([])
  const [applications, setApplications] = useState<Pick<Application, "id" | "title" | "company" | "status">[]>([])
  const [loading, setLoading] = useState(true)
  const [scanState, setScanState] = useState<ScanState>({
    scanning: false,
    classifying: false,
    classified: 0,
    total: 0,
    lastScan: null,
  })
  const classifyAttemptsRef = useRef<Record<string, number>>({})

  // ── Load cached data on mount ──────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [emailsRes, linksRes, appsRes, settingsRes] = await Promise.all([
        supabase.from("emails").select("*").eq("user_id", user.id).order("received_at", { ascending: false }),
        supabase.from("email_application_links").select("*").eq("user_id", user.id),
        supabase.from("applications").select("id, title, company, status").eq("user_id", user.id),
        supabase.from("user_settings").select("last_email_scan").eq("user_id", user.id).maybeSingle(),
      ])

      setEmails(emailsRes.data || [])
      setLinks(linksRes.data || [])
      setApplications((appsRes.data || []) as Pick<Application, "id" | "title" | "company" | "status">[])
      setScanState((prev) => ({
        ...prev,
        lastScan: settingsRes.data?.last_email_scan || null,
      }))
      setLoading(false)
    }
    load()
  }, [])

  // ── Scan-on-load trigger ───────────────────────────────────────
  useEffect(() => {
    if (loading) return
    autoScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const autoScan = useCallback(async () => {
    // Check for orphaned unclassified emails first
    const orphans = emails.filter((e) => e.category === "unclassified")
    if (orphans.length > 0) {
      await classifyEmails(orphans)
      return
    }

    // Cooldown check
    if (scanState.lastScan) {
      const elapsed = Date.now() - new Date(scanState.lastScan).getTime()
      if (elapsed < SCAN_COOLDOWN_MS) return
    }

    await runScan()
  }, [emails, scanState.lastScan])

  // ── Scan Gmail for new emails ──────────────────────────────────
  const runScan = useCallback(async (forceSince?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setScanState((prev) => ({ ...prev, scanning: true }))

    const since = forceSince || scanState.lastScan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    let pageToken: string | null = null
    const allNewEmails: Email[] = []

    try {
      // Paginated fetch
      do {
        const resp: Response = await fetch("/api/gmail/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since, page_token: pageToken }),
        })
        const data: any = await resp.json()

        if (data.error && !data.emails?.length) break

        // Dedup against existing emails
        const existingGmailIds = new Set(emails.map((e) => e.gmail_id))
        const newMetadata = (data.emails || []).filter(
          (e: { gmail_id: string }) => !existingGmailIds.has(e.gmail_id)
        )

        // Insert unclassified rows into Supabase
        if (newMetadata.length > 0) {
          const rows = newMetadata.map((e: any) => ({
            user_id: user.id,
            gmail_id: e.gmail_id,
            thread_id: e.thread_id,
            from_email: e.from_email,
            from_name: e.from_name,
            from_domain: e.from_domain || extractDomain(e.from_email),
            to_email: e.to_email,
            subject: e.subject,
            received_at: e.received_at,
            category: "unclassified",
          }))

          const { data: inserted } = await supabase
            .from("emails")
            .upsert(rows, { onConflict: "user_id,gmail_id", ignoreDuplicates: true })
            .select()

          if (inserted) {
            allNewEmails.push(...inserted)
            setEmails((prev) => [...inserted, ...prev])
          }
        }

        pageToken = data.next_page_token
      } while (pageToken)

      // Update scan timestamp
      await supabase.from("user_settings").upsert(
        { user_id: user.id, last_email_scan: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      setScanState((prev) => ({ ...prev, scanning: false, lastScan: new Date().toISOString() }))

      // Classify new emails
      if (allNewEmails.length > 0) {
        await classifyEmails(allNewEmails)
      }
    } catch (error) {
      console.error("Scan error:", error)
      setScanState((prev) => ({ ...prev, scanning: false }))
    }
  }, [emails, scanState.lastScan])

  // ── Auto-update application statuses from email signals ───────
  const autoUpdateApplicationStatuses = useCallback(async (classifiedEmails: Email[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const cutoff = new Date(Date.now() - STATUS_UPDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Fetch full applications with dates for matching
    const { data: fullApps } = await supabase
      .from("applications")
      .select("id, title, company, status, date_applied, date_found")
      .eq("user_id", user.id)

    if (!fullApps || fullApps.length === 0) return

    const eligibleApps = fullApps.filter((app) => {
      const refDate = app.date_applied || app.date_found
      return refDate && new Date(refDate) >= cutoff
    })

    for (const email of classifiedEmails) {
      const targetStatus = CATEGORY_TO_STATUS[email.category]
      if (!targetStatus) continue

      const companyFromEmail = email.classification_json?.company
      if (!companyFromEmail) continue

      // Find matching applications by fuzzy company name
      const matches = eligibleApps.filter((app) => fuzzyCompanyMatch(companyFromEmail, app.company))

      if (matches.length === 1) {
        const match = matches[0]

        // Don't downgrade status (e.g., don't set "rejected" if already "offer")
        const statusOrder = ["found", "interested", "applied", "phone_screen", "interview", "offer", "rejected", "withdrawn", "ghosted"]
        const currentIdx = statusOrder.indexOf(match.status)
        const targetIdx = statusOrder.indexOf(targetStatus)
        if (targetStatus !== "rejected" && targetIdx <= currentIdx) continue

        await supabase
          .from("applications")
          .update({ status: targetStatus, date_response: new Date().toISOString() })
          .eq("id", match.id)

        // Create email_application_link
        await supabase
          .from("email_application_links")
          .upsert(
            { email_id: email.id, application_id: match.id, user_id: user.id, linked_by: "auto_status" },
            { onConflict: "email_id,application_id" }
          )

        // Update local state
        setLinks((prev) => [
          ...prev.filter((l) => !(l.email_id === email.id && l.application_id === match.id)),
          { email_id: email.id, application_id: match.id, user_id: user.id, linked_by: "auto_status", linked_at: new Date().toISOString() },
        ])
        setApplications((prev) => prev.map((a) =>
          a.id === match.id ? { ...a, status: targetStatus } : a
        ))

        console.log(`[auto-status] ${match.company}: ${match.status} → ${targetStatus} (via ${email.category} email)`)
      } else if (matches.length > 1) {
        // Ambiguous — just set suggestion, don't auto-update
        const mostRecent = matches.sort((a, b) =>
          new Date(b.date_applied || b.date_found).getTime() - new Date(a.date_applied || a.date_found).getTime()
        )[0]
        await supabase
          .from("emails")
          .update({ suggested_application_id: mostRecent.id })
          .eq("id", email.id)
      }
    }
  }, [])

  // ── Classify emails in batches ─────────────────────────────────
  const classifyEmails = useCallback(async (toClassify: Email[]) => {
    setScanState((prev) => ({
      ...prev,
      classifying: true,
      classified: 0,
      total: toClassify.length,
    }))

    // Filter out emails that exceeded retry limit
    const eligible: Email[] = []
    for (const email of toClassify) {
      const attempts = classifyAttemptsRef.current[email.gmail_id] || 0
      if (attempts >= MAX_CLASSIFY_ATTEMPTS) {
        await supabase.from("emails").update({
          category: "irrelevant",
          classification_json: { category: "irrelevant", company: null, role: null, urgency: "low", summary: "Classification failed after multiple attempts" },
          dismissed: true,
        }).eq("id", email.id)
        setEmails((prev) => prev.map((e) =>
          e.id === email.id ? { ...e, category: "irrelevant", dismissed: true } : e
        ))
        setScanState((prev) => ({ ...prev, classified: prev.classified + 1 }))
      } else {
        classifyAttemptsRef.current[email.gmail_id] = attempts + 1
        eligible.push(email)
      }
    }

    // Track successfully classified emails for auto-status-update
    const classifiedResults: Email[] = []

    // Process in batches of BATCH_SIZE
    for (let batchStart = 0; batchStart < eligible.length; batchStart += BATCH_SIZE) {
      const batch = eligible.slice(batchStart, batchStart + BATCH_SIZE)

      try {
        // Fetch bodies for the batch in parallel
        const bodyResults = await Promise.all(
          batch.map(async (email) => {
            try {
              const resp = await fetch("/api/gmail/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gmail_id: email.gmail_id }),
              })
              const { body } = await resp.json()
              return body || ""
            } catch {
              return ""
            }
          })
        )

        // Build batch request
        const emailInputs = batch.map((email, i) => ({
          from_email: email.from_email,
          from_name: email.from_name,
          subject: email.subject,
          received_at: email.received_at,
          body: bodyResults[i],
        }))

        const classifyResp = await fetch("/api/gmail/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: emailInputs }),
        })
        const { results } = await classifyResp.json() as { results: ClassificationResult[] }

        // Process each result
        for (let j = 0; j < batch.length; j++) {
          const email = batch[j]
          const classification = results?.[j] || { category: "irrelevant", company: null, role: null, urgency: "low", summary: "Classification failed" } as ClassificationResult
          const bodyPreview = (bodyResults[j] || "").slice(0, 500)
          const suggestedAppId = await computeSuggestion(email, applications)

          const updates: Record<string, unknown> = {
            category: classification.category,
            classification_json: classification,
            body_preview: bodyPreview,
            suggested_application_id: suggestedAppId,
          }
          if (classification.category === "irrelevant") {
            updates.dismissed = true
          }

          await supabase.from("emails").update(updates).eq("id", email.id)
          const updatedEmail = { ...email, ...updates } as Email
          setEmails((prev) => prev.map((e) =>
            e.id === email.id ? updatedEmail : e
          ))
          classifiedResults.push(updatedEmail)
          setScanState((prev) => ({ ...prev, classified: prev.classified + 1 }))
        }
      } catch (error) {
        console.error("Batch classification failed:", error)
        // Mark batch progress even on failure
        setScanState((prev) => ({ ...prev, classified: prev.classified + batch.length }))
      }

      // Delay between batches
      if (batchStart + BATCH_SIZE < eligible.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    // Auto-update application statuses based on status-signal emails
    const statusEmails = classifiedResults.filter((e) => e.category in CATEGORY_TO_STATUS)
    if (statusEmails.length > 0) {
      await autoUpdateApplicationStatuses(statusEmails)
    }

    // Auto-track: detect confirmation emails and create application records
    try {
      const linkedIds = new Set(links.map((l) => l.email_id))
      const unlinked = classifiedResults.filter((e) => !linkedIds.has(e.id) && !e.auto_track_status)
      if (unlinked.length > 0) {
        const resp = await fetch("/api/auto-track/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_ids: unlinked.map((e) => e.id) }),
        })
        if (resp.ok) {
          const { results } = await resp.json()
          const trackedIds: string[] = []
          for (const r of results || []) {
            if (r.tracked && r.application_id) {
              trackedIds.push(r.email_id)
              setLinks((prev) => [
                ...prev,
                { email_id: r.email_id, application_id: r.application_id, user_id: "", linked_by: "auto_track" as const, linked_at: new Date().toISOString() },
              ])
            }
          }
          // Update local email state with auto_track_status
          if (trackedIds.length > 0) {
            setEmails((prev) => prev.map((e) =>
              trackedIds.includes(e.id) ? { ...e, auto_track_status: "tracked" } : e
            ))
            // Reload applications to pick up newly created ones
            const { data: freshApps } = await supabase
              .from("applications")
              .select("id, title, company, status")
              .eq("user_id", (await supabase.auth.getUser()).data.user?.id || "")
            if (freshApps) setApplications(freshApps as Pick<Application, "id" | "title" | "company" | "status">[])
          }
          // Update prompted emails
          const prompted = (results || []).filter((r: { promptUser?: boolean }) => r.promptUser)
          if (prompted.length > 0) {
            setEmails((prev) => prev.map((e) => {
              const match = prompted.find((r: { email_id: string; extraction?: unknown }) => r.email_id === e.id)
              return match ? { ...e, auto_track_status: "prompted", auto_track_data: match.extraction } : e
            }))
          }
        }
      }
    } catch (err) {
      console.error("[auto-track] Non-blocking error:", err)
    }

    // CAR-79: Progressive backfill — process up to 20 unprocessed emails from last 30 days
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const alreadyProcessedIds = new Set(classifiedResults.map((e) => e.id))
      const backfillLinkedIds = new Set([...links.map((l) => l.email_id)])
      // Also include any we just linked above
      classifiedResults.forEach((e) => { if (e.auto_track_status) alreadyProcessedIds.add(e.id) })

      const unprocessed = emails.filter((e) =>
        e.auto_track_status === null &&
        e.category !== "unclassified" &&
        !alreadyProcessedIds.has(e.id) &&
        !backfillLinkedIds.has(e.id) &&
        new Date(e.received_at) > thirtyDaysAgo
      ).slice(0, 20)

      if (unprocessed.length > 0) {
        const bfResp = await fetch("/api/auto-track/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_ids: unprocessed.map((e) => e.id) }),
        })
        if (bfResp.ok) {
          const { results: bfResults } = await bfResp.json()
          const bfTrackedIds: string[] = []
          for (const r of bfResults || []) {
            if (r.tracked && r.application_id) {
              bfTrackedIds.push(r.email_id)
              setLinks((prev) => [
                ...prev,
                { email_id: r.email_id, application_id: r.application_id, user_id: "", linked_by: "auto_track" as const, linked_at: new Date().toISOString() },
              ])
            }
          }
          if (bfTrackedIds.length > 0) {
            setEmails((prev) => prev.map((e) =>
              bfTrackedIds.includes(e.id) ? { ...e, auto_track_status: "tracked" } : e
            ))
            const { data: freshApps } = await supabase
              .from("applications")
              .select("id, title, company, status")
              .eq("user_id", (await supabase.auth.getUser()).data.user?.id || "")
            if (freshApps) setApplications(freshApps as Pick<Application, "id" | "title" | "company" | "status">[])
          }
          const bfPrompted = (bfResults || []).filter((r: { promptUser?: boolean }) => r.promptUser)
          if (bfPrompted.length > 0) {
            setEmails((prev) => prev.map((e) => {
              const match = bfPrompted.find((r: { email_id: string; extraction?: unknown }) => r.email_id === e.id)
              return match ? { ...e, auto_track_status: "prompted", auto_track_data: match.extraction } : e
            }))
          }
        }
      }
    } catch (err) {
      console.error("[auto-track-backfill] Non-blocking error:", err)
    }

    setScanState((prev) => ({ ...prev, classifying: false }))
  }, [applications, autoUpdateApplicationStatuses])

  // ── Suggestion computation ─────────────────────────────────────
  const computeSuggestion = async (
    email: Email,
    apps: Pick<Application, "id" | "title" | "company" | "status">[]
  ): Promise<string | null> => {
    // Priority 1: thread siblings
    if (email.thread_id) {
      const { data: siblings } = await supabase
        .from("email_application_links")
        .select("application_id, email_id")
        .in(
          "email_id",
          emails
            .filter((e) => e.thread_id === email.thread_id && e.id !== email.id)
            .map((e) => e.id)
        )

      if (siblings && siblings.length > 0) {
        return siblings[0].application_id
      }
    }

    // Priority 2: domain matching
    return findDomainMatch(email.from_domain || "", apps)
  }

  // ── Link / Unlink / Dismiss ────────────────────────────────────
  const linkEmail = useCallback(async (
    emailId: string,
    applicationId: string,
    linkedBy: "manual" | "confirmed_suggestion" = "manual"
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("email_application_links")
      .insert({ email_id: emailId, application_id: applicationId, user_id: user.id, linked_by: linkedBy })
      .select()
      .single()

    if (data) {
      setLinks((prev) => [...prev, data])
    }
  }, [])

  const unlinkEmail = useCallback(async (emailId: string, applicationId: string) => {
    await supabase
      .from("email_application_links")
      .delete()
      .eq("email_id", emailId)
      .eq("application_id", applicationId)

    setLinks((prev) =>
      prev.filter((l) => !(l.email_id === emailId && l.application_id === applicationId))
    )
  }, [])

  const dismissEmail = useCallback(async (emailId: string) => {
    await supabase.from("emails").update({ dismissed: true }).eq("id", emailId)
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, dismissed: true } : e
    ))
  }, [])

  const undismissEmail = useCallback(async (emailId: string) => {
    await supabase.from("emails").update({ dismissed: false }).eq("id", emailId)
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, dismissed: false } : e
    ))
  }, [])

  const dismissMany = useCallback(async (emailIds: string[]) => {
    await supabase.from("emails").update({ dismissed: true }).in("id", emailIds)
    setEmails((prev) => prev.map((e) =>
      emailIds.includes(e.id) ? { ...e, dismissed: true } : e
    ))
  }, [])

  const linkMany = useCallback(async (emailIds: string[], applicationId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = emailIds.map((emailId) => ({
      email_id: emailId,
      application_id: applicationId,
      user_id: user.id,
      linked_by: "manual" as const,
    }))

    const { data } = await supabase.from("email_application_links").insert(rows).select()
    if (data) {
      setLinks((prev) => [...prev, ...data])
    }
  }, [])

  const markRead = useCallback(async (emailId: string) => {
    await supabase.from("emails").update({ is_read: true }).eq("id", emailId)
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, is_read: true } : e
    ))
  }, [])

  const markReplied = useCallback((emailId: string) => {
    setEmails((prev) => prev.map((e) =>
      e.id === emailId ? { ...e, replied_at: new Date().toISOString() } : e
    ))
  }, [])

  // ── CAR-79: Manual backfill auto-track ─────────────────────────
  const backfillAutoTrack = useCallback(async (
    onProgress: (current: number, total: number, found: number) => void,
  ): Promise<number> => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const linkedIds = new Set(links.map((l) => l.email_id))
    const unprocessed = emails.filter((e) =>
      e.auto_track_status === null &&
      e.category !== "unclassified" &&
      !linkedIds.has(e.id) &&
      new Date(e.received_at) > sevenDaysAgo
    )

    if (unprocessed.length === 0) return 0

    let found = 0
    const batchSize = 10

    for (let i = 0; i < unprocessed.length; i += batchSize) {
      const batch = unprocessed.slice(i, i + batchSize)
      onProgress(i, unprocessed.length, found)

      try {
        const resp = await fetch("/api/auto-track/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_ids: batch.map((e) => e.id) }),
        })
        if (resp.ok) {
          const { results } = await resp.json()
          const trackedIds: string[] = []
          for (const r of results || []) {
            if (r.tracked && r.application_id) {
              found++
              trackedIds.push(r.email_id)
              setLinks((prev) => [
                ...prev,
                { email_id: r.email_id, application_id: r.application_id, user_id: "", linked_by: "auto_track" as const, linked_at: new Date().toISOString() },
              ])
            }
          }
          if (trackedIds.length > 0) {
            setEmails((prev) => prev.map((e) =>
              trackedIds.includes(e.id) ? { ...e, auto_track_status: "tracked" } : e
            ))
          }
          const prompted = (results || []).filter((r: { promptUser?: boolean }) => r.promptUser)
          if (prompted.length > 0) {
            setEmails((prev) => prev.map((e) => {
              const match = prompted.find((r: { email_id: string; extraction?: unknown }) => r.email_id === e.id)
              return match ? { ...e, auto_track_status: "prompted", auto_track_data: match.extraction } : e
            }))
          }
        }
      } catch (err) {
        console.error("[backfill] Batch error:", err)
      }

      if (i + batchSize < unprocessed.length) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    onProgress(unprocessed.length, unprocessed.length, found)

    // Reload applications to pick up newly created ones
    if (found > 0) {
      const { data: freshApps } = await supabase
        .from("applications")
        .select("id, title, company, status")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id || "")
      if (freshApps) setApplications(freshApps as Pick<Application, "id" | "title" | "company" | "status">[])
    }

    return found
  }, [emails, links])

  // ── Manual refresh ─────────────────────────────────────────────
  const refresh = useCallback(() => runScan(), [runScan])

  return {
    emails,
    links,
    applications,
    loading,
    scanState,
    linkEmail,
    unlinkEmail,
    dismissEmail,
    undismissEmail,
    dismissMany,
    linkMany,
    markRead,
    markReplied,
    refresh,
    backfillAutoTrack,
  }
}
