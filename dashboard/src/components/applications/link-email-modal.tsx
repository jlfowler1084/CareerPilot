"use client"

import { useEffect, useState, useMemo } from "react"
import { X, Search, Loader2, Link2, ChevronRight, ChevronDown, MessageSquare } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import { CategoryBadge } from "@/components/inbox/category-badge"
import { formatDistanceToNow } from "date-fns"
import type { Email } from "@/types"

const supabase = createClient()

interface LinkEmailModalProps {
  applicationId: string
  companyName: string
  open: boolean
  onClose: () => void
  onLinked: () => void
}

interface ThreadGroup {
  threadId: string
  subject: string
  participants: string[]
  emails: Email[]
  latestDate: string
  linkedCount: number
  unlinkedEmails: Email[]
}

function extractCompanyKeyword(name: string): string {
  const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)
  // Take the longest word as the most distinguishing keyword
  return words.reduce((a, b) => (b.length > a.length ? b : a), "")
}

function buildThreadGroups(emails: Email[], alreadyLinked: Set<string>): ThreadGroup[] {
  const threadMap = new Map<string, Email[]>()

  for (const email of emails) {
    const key = email.thread_id ?? email.gmail_id
    if (!threadMap.has(key)) {
      threadMap.set(key, [])
    }
    threadMap.get(key)!.push(email)
  }

  const groups: ThreadGroup[] = []

  for (const [threadId, threadEmails] of threadMap) {
    const sorted = [...threadEmails].sort(
      (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
    )
    const earliest = sorted[0]
    const latest = sorted[sorted.length - 1]

    const participantSet = new Set<string>()
    for (const e of sorted) {
      if (e.from_name) participantSet.add(e.from_name)
    }

    const linkedCount = sorted.filter((e) => alreadyLinked.has(e.id)).length
    const unlinkedEmails = sorted.filter((e) => !alreadyLinked.has(e.id))

    groups.push({
      threadId,
      subject: earliest.subject ?? "(no subject)",
      participants: Array.from(participantSet),
      emails: sorted,
      latestDate: latest.received_at,
      linkedCount,
      unlinkedEmails,
    })
  }

  return groups
}

export function LinkEmailModal({
  applicationId,
  companyName,
  open,
  onClose,
  onLinked,
}: LinkEmailModalProps) {
  const [emails, setEmails] = useState<Email[]>([])
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [linking, setLinking] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setSelected(new Set())
      setExpanded(new Set())

      // Fetch already-linked email IDs for this app
      const { data: links } = await supabase
        .from("email_application_links")
        .select("email_id")
        .eq("application_id", applicationId)

      const alreadyLinked = new Set<string>((links || []).map((l: { email_id: string }) => l.email_id))

      // Fetch recent actionable emails
      const { data: emailData } = await supabase
        .from("emails")
        .select("*")
        .in("category", [
          "recruiter_outreach",
          "interview_request",
          "follow_up",
          "offer",
          "rejection",
        ])
        .order("received_at", { ascending: false })
        .limit(100)

      if (cancelled) return

      setLinkedIds(alreadyLinked)
      setEmails(emailData || [])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [open, applicationId])

  const keyword = useMemo(() => extractCompanyKeyword(companyName), [companyName])

  const threads = useMemo(() => {
    const groups = buildThreadGroups(emails, linkedIds)

    // Apply search filter: thread matches if any email matches
    let list = groups
    if (search.trim()) {
      const q = search.toLowerCase()
      list = groups.filter((thread) =>
        thread.emails.some(
          (e) =>
            (e.from_name || "").toLowerCase().includes(q) ||
            e.from_email.toLowerCase().includes(q) ||
            (e.subject || "").toLowerCase().includes(q)
        )
      )
    }

    // Sort: company-keyword threads first (check subject + participants), then by latestDate desc
    return list.sort((a, b) => {
      const aSubjectMatch = a.subject.toLowerCase().includes(keyword)
      const aParticipantMatch = a.participants.some((p) => p.toLowerCase().includes(keyword))
      const aEmailDomainMatch = a.emails.some((e) => (e.from_domain || "").includes(keyword))
      const aMatch = aSubjectMatch || aParticipantMatch || aEmailDomainMatch ? 1 : 0

      const bSubjectMatch = b.subject.toLowerCase().includes(keyword)
      const bParticipantMatch = b.participants.some((p) => p.toLowerCase().includes(keyword))
      const bEmailDomainMatch = b.emails.some((e) => (e.from_domain || "").includes(keyword))
      const bMatch = bSubjectMatch || bParticipantMatch || bEmailDomainMatch ? 1 : 0

      if (bMatch !== aMatch) return bMatch - aMatch
      return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
    })
  }, [emails, linkedIds, search, keyword])

  function toggleSelect(threadId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }

  function toggleExpand(threadId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }

  const totalUnlinkedInSelection = useMemo(() => {
    return threads
      .filter((t) => selected.has(t.threadId))
      .reduce((sum, t) => sum + t.unlinkedEmails.length, 0)
  }, [threads, selected])

  async function handleLink() {
    if (selected.size === 0) return
    setLinking(true)

    if (!user) { setLinking(false); return }

    const selectedThreads = threads.filter((t) => selected.has(t.threadId))
    const inserts = selectedThreads.flatMap((thread) =>
      thread.unlinkedEmails.map((email) => ({
        email_id: email.id,
        application_id: applicationId,
        user_id: user.id,
        linked_by: "manual" as const,
      }))
    )

    await supabase.from("email_application_links").upsert(inserts, {
      onConflict: "email_id,application_id",
    })

    setLinking(false)
    onLinked()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <div>
            <h3 className="text-sm font-bold text-zinc-800">Link Emails</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              Showing emails matching &quot;{companyName}&quot;
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-zinc-50">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by sender, subject..."
              className="w-full text-xs border border-zinc-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="text-zinc-400 animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-8">
              No matching emails found
            </p>
          ) : (
            threads.map((thread) => {
              const isFullyLinked = thread.unlinkedEmails.length === 0
              const isPartiallyLinked = thread.linkedCount > 0 && !isFullyLinked
              const isChecked = selected.has(thread.threadId)
              const isMulti = thread.emails.length > 1
              const isExpanded = expanded.has(thread.threadId)
              const latestEmail = thread.emails[thread.emails.length - 1]
              const isCompanyMatch = thread.emails.some((e) => (e.from_domain || "").includes(keyword))

              return (
                <div key={thread.threadId} className="mb-0.5">
                  {/* Thread row */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isFullyLinked) toggleSelect(thread.threadId)
                    }}
                    disabled={isFullyLinked}
                    className={`w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg transition-colors ${
                      isFullyLinked
                        ? "opacity-50 cursor-default border border-transparent"
                        : isChecked
                        ? "bg-amber-50 border border-amber-200"
                        : "hover:bg-zinc-50 border border-transparent"
                    }`}
                  >
                    {/* Expand arrow — only for multi-email threads */}
                    <span
                      className="mt-0.5 flex-shrink-0 text-zinc-400 w-3.5"
                      onClick={(e) => {
                        if (isMulti) {
                          e.stopPropagation()
                          toggleExpand(thread.threadId)
                        }
                      }}
                    >
                      {isMulti ? (
                        isExpanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )
                      ) : null}
                    </span>

                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      aria-label={`Select thread: ${thread.subject}`}
                      checked={isChecked}
                      readOnly
                      disabled={isFullyLinked}
                      className="mt-1 rounded border-zinc-300 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-zinc-700 truncate">
                          {thread.subject}
                        </span>
                        {isCompanyMatch && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium flex-shrink-0">
                            Domain match
                          </span>
                        )}
                        {isFullyLinked && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium flex-shrink-0">
                            All linked
                          </span>
                        )}
                        {isPartiallyLinked && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium flex-shrink-0">
                            {thread.linkedCount} of {thread.emails.length} linked
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-auto">
                          {formatDistanceToNow(new Date(thread.latestDate), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-zinc-500 truncate">
                          {thread.participants.join(", ") || latestEmail.from_email}
                        </p>
                        {isMulti && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400 flex-shrink-0">
                            <MessageSquare size={9} />
                            {thread.emails.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-1">
                        <CategoryBadge category={latestEmail.category} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded sub-emails */}
                  {isMulti && isExpanded && (
                    <div className="ml-8 border-l-2 border-zinc-200 pl-3 mb-1">
                      {thread.emails.map((email) => {
                        const isLinked = linkedIds.has(email.id)
                        return (
                          <div
                            key={email.id}
                            className="py-1.5 flex items-start gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-medium text-zinc-600 truncate">
                                  {email.from_name || email.from_email}
                                </span>
                                <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-auto">
                                  {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-500 truncate">
                                {email.subject || "(no subject)"}
                              </p>
                            </div>
                            {isLinked && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium flex-shrink-0 mt-0.5">
                                Linked
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
          <span className="text-[10px] text-zinc-400">
            {selected.size > 0
              ? `${selected.size} thread${selected.size !== 1 ? "s" : ""} selected (${totalUnlinkedInSelection} email${totalUnlinkedInSelection !== 1 ? "s" : ""})`
              : "0 threads selected"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleLink}
              disabled={selected.size === 0 || linking}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {linking ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              Link {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
