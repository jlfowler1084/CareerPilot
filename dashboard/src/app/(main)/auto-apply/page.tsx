"use client"

import { Suspense, useState, useEffect, useCallback, useMemo } from "react"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { EmptyState } from "@/components/shared/empty-state"
import { Rocket, Check, X, ExternalLink, Search } from "lucide-react"
import { toast } from "sonner"
import type { AutoApplyQueueItem } from "@/types"

export default function AutoApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <h2 className="text-lg font-bold mb-6">Auto-Apply Queue</h2>
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-zinc-100 rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <AutoApplyContent />
    </Suspense>
  )
}

// ─── Helpers ────────────────────────────────────────

const TODAY = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
})

function isLocalLocation(location: string | null): boolean {
  if (!location) return false
  const lower = location.toLowerCase()
  return lower.includes("indianapolis") || lower.includes("indy") || lower.includes("sheridan") || lower.includes(", in")
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-zinc-500 bg-zinc-50 border-zinc-200"
  if (score >= 85) return "text-emerald-700 bg-emerald-50 border-emerald-200"
  if (score >= 70) return "text-amber-700 bg-amber-50 border-amber-200"
  return "text-red-700 bg-red-50 border-red-200"
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    case "pending":
      return { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-300" }
    case "applied":
      return { label: "Applied", className: "bg-blue-100 text-blue-800 border-blue-300" }
    case "failed":
      return { label: "Failed", className: "bg-red-100 text-red-800 border-red-300" }
    case "skipped":
      return { label: "Skipped", className: "bg-zinc-100 text-zinc-600 border-zinc-300" }
    default:
      return { label: status, className: "bg-zinc-100 text-zinc-600 border-zinc-300" }
  }
}

/** Sort: approved first, then local before remote within each status group, then score desc */
function sortQueue(items: AutoApplyQueueItem[]): AutoApplyQueueItem[] {
  return [...items].sort((a, b) => {
    // Status priority: approved < pending < everything else
    const statusOrder = (s: string) => (s === "approved" ? 0 : s === "pending" ? 1 : 2)
    const sa = statusOrder(a.status)
    const sb = statusOrder(b.status)
    if (sa !== sb) return sa - sb

    // Local before remote
    const la = isLocalLocation(a.location) ? 0 : 1
    const lb = isLocalLocation(b.location) ? 0 : 1
    if (la !== lb) return la - lb

    // Score descending
    return (b.fit_score ?? 0) - (a.fit_score ?? 0)
  })
}

// ─── Main Content ───────────────────────────────────

function AutoApplyContent() {
  const { user, loading: authLoading } = useAuth()
  const [queue, setQueue] = useState<AutoApplyQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchQueue = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const supabase = createClient()
    const { data } = await supabase
      .from("auto_apply_queue")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["approved", "pending"])
      .order("fit_score", { ascending: false })
    setQueue((data as AutoApplyQueueItem[]) || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    fetchQueue()

    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel("auto-apply-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auto_apply_queue" },
        () => fetchQueue()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchQueue, authLoading, user])

  const updateStatus = useCallback(async (id: string, status: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("auto_apply_queue")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      toast.error(`Failed to update status`)
      return
    }
    setQueue((prev) => prev.map((q) => q.id === id ? { ...q, status: status as AutoApplyQueueItem["status"], updated_at: new Date().toISOString() } : q))
    toast.success(`Job ${status === "approved" ? "approved" : status === "applied" ? "marked as applied" : status === "skipped" ? "skipped" : "updated"}`)
  }, [])

  const sorted = useMemo(() => sortQueue(queue), [queue])
  const approved = useMemo(() => sorted.filter((q) => q.status === "approved"), [sorted])
  const pending = useMemo(() => sorted.filter((q) => q.status === "pending"), [sorted])
  const appliedToday = useMemo(() => {
    // We don't fetch applied items, so this stays 0 unless we add a separate count
    return 0
  }, [])

  // Stats counts
  const stats = {
    approved: approved.length,
    appliedToday,
    pending: pending.length,
  }

  if (authLoading || loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-bold mb-6">Auto-Apply Queue</h2>
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div className="p-6">
        <Header stats={stats} />
        <EmptyState
          icon={Rocket}
          title="No jobs in queue"
          description="Run a job search to populate the auto-apply queue. Jobs scoring 80+ are auto-queued for approval."
          actions={[{ label: "Search Jobs", href: "/search" }]}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <Header stats={stats} />

      {/* Approved Queue — the table Cowork reads */}
      {approved.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-zinc-900 mb-3">
            Ready to Apply ({approved.length})
          </h3>
          <QueueTable items={approved} onUpdateStatus={updateStatus} />
        </section>
      )}

      {/* Pending Review */}
      {pending.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-zinc-900 mb-3">
            Pending Review ({pending.length})
          </h3>
          <QueueTable items={pending} onUpdateStatus={updateStatus} />
        </section>
      )}
    </div>
  )
}

// ─── Header ─────────────────────────────────────────

function Header({ stats }: { stats: { approved: number; appliedToday: number; pending: number } }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-bold text-zinc-900">Auto-Apply Queue</h2>
      <p className="text-sm text-zinc-500 mt-0.5">
        {TODAY} &middot; 3 jobs/day &middot; Local first &middot; Manual approval
      </p>
      <p className="text-xs font-mono text-zinc-400 mt-1">
        {stats.approved} approved &middot; {stats.appliedToday} applied today &middot; {stats.pending} pending review
      </p>
    </div>
  )
}

// ─── Queue Table (Cowork-readable) ──────────────────

function QueueTable({
  items,
  onUpdateStatus,
}: {
  items: AutoApplyQueueItem[]
  onUpdateStatus: (id: string, status: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider w-10">#</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">Job Title</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">Company</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">Location</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider w-16 text-center">Score</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider w-20">Source</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider w-24">Status</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">URL</th>
            <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider w-44 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const badge = statusBadge(item.status)
            const local = isLocalLocation(item.location)
            return (
              <tr
                key={item.id}
                className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors"
              >
                {/* # */}
                <td className="px-4 py-3 text-sm font-mono text-zinc-400">{idx + 1}</td>

                {/* Job Title — large for Cowork */}
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-zinc-900 leading-tight">
                    {item.job_title}
                  </span>
                </td>

                {/* Company */}
                <td className="px-4 py-3 text-sm text-zinc-700">{item.company}</td>

                {/* Location — bold if local */}
                <td className="px-4 py-3">
                  <span className={`text-sm ${local ? "font-bold text-zinc-900" : "text-zinc-500"}`}>
                    {item.location || "N/A"}
                  </span>
                </td>

                {/* Score — color-coded */}
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block text-sm font-bold px-2 py-0.5 rounded border ${scoreColor(item.fit_score)}`}>
                    {item.fit_score}
                  </span>
                </td>

                {/* Source */}
                <td className="px-4 py-3">
                  <span className="text-sm text-zinc-600">{item.source || "—"}</span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs font-bold px-2 py-1 rounded border ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>

                {/* URL — clickable link for Cowork */}
                <td className="px-4 py-3">
                  {item.job_url ? (
                    <a
                      href={item.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      <ExternalLink size={14} />
                      Open
                    </a>
                  ) : (
                    <span className="text-sm text-zinc-400">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {item.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(item.id, "approved")}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(item.id, "skipped")}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 border border-zinc-200 hover:border-red-200 transition-colors"
                        >
                          <X size={12} /> Reject
                        </button>
                      </>
                    )}
                    {item.status === "approved" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(item.id, "applied")}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          <Check size={12} /> Mark Applied
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(item.id, "skipped")}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 border border-zinc-200 hover:border-red-200 transition-colors"
                        >
                          <X size={12} /> Skip
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
