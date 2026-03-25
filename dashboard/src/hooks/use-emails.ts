"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { extractDomain, extractPreview } from "@/lib/gmail/parse"
import { findDomainMatch } from "@/lib/gmail/suggestions"
import type { Email, EmailApplicationLink, ClassificationResult, Application } from "@/types"

const supabase = createClient()
const SCAN_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 1000
const MAX_CLASSIFY_ATTEMPTS = 3

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
        supabase.from("user_settings").select("last_email_scan").eq("user_id", user.id).single(),
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

    const since = forceSince || scanState.lastScan || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
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

  // ── Classify emails in batches ─────────────────────────────────
  const classifyEmails = useCallback(async (toClassify: Email[]) => {
    setScanState((prev) => ({
      ...prev,
      classifying: true,
      classified: 0,
      total: toClassify.length,
    }))

    for (let i = 0; i < toClassify.length; i++) {
      const email = toClassify[i]

      // Check retry limit
      const attempts = classifyAttemptsRef.current[email.gmail_id] || 0
      if (attempts >= MAX_CLASSIFY_ATTEMPTS) {
        // Auto-mark as irrelevant after max attempts
        await supabase.from("emails").update({
          category: "irrelevant",
          classification_json: { category: "irrelevant", company: null, role: null, urgency: "low", summary: "Classification failed after multiple attempts" },
          dismissed: true,
        }).eq("id", email.id)
        setEmails((prev) => prev.map((e) =>
          e.id === email.id ? { ...e, category: "irrelevant", dismissed: true } : e
        ))
        setScanState((prev) => ({ ...prev, classified: prev.classified + 1 }))
        continue
      }
      classifyAttemptsRef.current[email.gmail_id] = attempts + 1

      try {
        // Fetch full body
        const bodyResp = await fetch("/api/gmail/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_id: email.gmail_id }),
        })
        const { body } = await bodyResp.json()

        const bodyPreview = (body || "").slice(0, 500)

        // Classify
        const classifyResp = await fetch("/api/gmail/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_email: email.from_email,
            from_name: email.from_name,
            subject: email.subject,
            received_at: email.received_at,
            body: body || "",
          }),
        })
        const classification: ClassificationResult = await classifyResp.json()

        // Compute suggestion
        const suggestedAppId = await computeSuggestion(email, applications)

        // Update Supabase
        const updates: Record<string, any> = {
          category: classification.category,
          classification_json: classification,
          body_preview: bodyPreview,
          suggested_application_id: suggestedAppId,
        }
        if (classification.category === "irrelevant") {
          updates.dismissed = true
        }

        await supabase.from("emails").update(updates).eq("id", email.id)

        // Update local state
        setEmails((prev) => prev.map((e) =>
          e.id === email.id
            ? { ...e, ...updates }
            : e
        ))
      } catch (error) {
        console.error(`Failed to classify email ${email.gmail_id}:`, error)
      }

      setScanState((prev) => ({ ...prev, classified: prev.classified + 1 }))

      // Batch delay
      if ((i + 1) % BATCH_SIZE === 0 && i + 1 < toClassify.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    setScanState((prev) => ({ ...prev, classifying: false }))
  }, [applications])

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
    refresh,
  }
}
