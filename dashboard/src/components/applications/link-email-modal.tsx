"use client"

import { useEffect, useState, useMemo } from "react"
import { X, Search, Loader2, Link2 } from "lucide-react"
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

function extractCompanyKeyword(name: string): string {
  const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)
  // Take the longest word as the most distinguishing keyword
  return words.reduce((a, b) => (b.length > a.length ? b : a), "")
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
  const [linking, setLinking] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setSelected(new Set())

      // Fetch already-linked email IDs for this app
      const { data: links } = await supabase
        .from("email_application_links")
        .select("email_id")
        .eq("application_id", applicationId)

      const alreadyLinked = new Set((links || []).map((l: { email_id: string }) => l.email_id))

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
      setEmails((emailData || []).filter((e: Email) => !alreadyLinked.has(e.id)))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [open, applicationId])

  const keyword = useMemo(() => extractCompanyKeyword(companyName), [companyName])

  const filtered = useMemo(() => {
    let list = emails

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) =>
          (e.from_name || "").toLowerCase().includes(q) ||
          e.from_email.toLowerCase().includes(q) ||
          (e.subject || "").toLowerCase().includes(q)
      )
    }

    // Sort: domain-matching emails first, then by date
    return list.sort((a, b) => {
      const aMatch = (a.from_domain || "").includes(keyword) ? 1 : 0
      const bMatch = (b.from_domain || "").includes(keyword) ? 1 : 0
      if (bMatch !== aMatch) return bMatch - aMatch
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    })
  }, [emails, search, keyword])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleLink() {
    if (selected.size === 0) return
    setLinking(true)

    if (!user) { setLinking(false); return }

    const inserts = Array.from(selected).map((emailId) => ({
      email_id: emailId,
      application_id: applicationId,
      user_id: user.id,
      linked_by: "manual" as const,
    }))

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

        {/* Email list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="text-zinc-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-8">
              No matching emails found
            </p>
          ) : (
            filtered.map((email) => {
              const isMatch = (email.from_domain || "").includes(keyword)
              const isChecked = selected.has(email.id)
              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => toggleSelect(email.id)}
                  className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                    isChecked
                      ? "bg-amber-50 border border-amber-200"
                      : "hover:bg-zinc-50 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="mt-1 rounded border-zinc-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-700 truncate">
                        {email.from_name || email.from_email}
                      </span>
                      {isMatch && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium flex-shrink-0">
                          Domain match
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-auto">
                        {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 truncate mt-0.5">
                      {email.subject || "(no subject)"}
                    </p>
                    <div className="mt-1">
                      <CategoryBadge category={email.category} />
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
          <span className="text-[10px] text-zinc-400">
            {selected.size} selected
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
