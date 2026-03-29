"use client"

import { useState, useMemo } from "react"
import { Check, X, CheckCheck, Trash2, ExternalLink, Loader2 } from "lucide-react"
import { FitScoreBadge } from "@/components/search/fit-score-badge"
import type { AutoApplyQueueItem, AutoApplyStatus } from "@/types"

interface AutoApplyQueueProps {
  queue: AutoApplyQueueItem[]
  loading: boolean
  counts: { pending: number; approved: number; applied: number; failed: number; total: number }
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onApproveAllAbove: (minScore: number) => void
  onClearRejected: () => void
}

type StatusFilter = "all" | "pending" | "approved" | "applied" | "failed"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", label: "Pending" },
  approved: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", label: "Approved" },
  generating: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "Generating..." },
  ready: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "Ready" },
  applying: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "Applying..." },
  applied: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", label: "Applied" },
  failed: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", label: "Failed" },
  skipped: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Skipped" },
  rejected: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Rejected" },
}

export function AutoApplyQueue({
  queue,
  loading,
  counts,
  onApprove,
  onReject,
  onApproveAllAbove,
  onClearRejected,
}: AutoApplyQueueProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const filtered = useMemo(() => {
    if (statusFilter === "all") return queue
    return queue.filter((q) => q.status === statusFilter)
  }, [queue, statusFilter])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
        {counts.pending} pending · {counts.approved} approved · {counts.applied} applied · {counts.failed} failed
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Status filter chips */}
          {(["all", "pending", "approved", "applied", "failed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] border cursor-pointer transition-all ${
                statusFilter === s
                  ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold"
                  : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-amber-300 dark:hover:border-amber-600"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {counts.pending > 0 && (
            <button
              type="button"
              onClick={() => onApproveAllAbove(80)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              <CheckCheck size={12} />
              Approve All 80+
            </button>
          )}
          {(queue.some((q) => q.status === "skipped" || q.status === "rejected")) && (
            <button
              type="button"
              onClick={onClearRejected}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
              Clear Rejected
            </button>
          )}
        </div>
      </div>

      {/* Queue items */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              onApprove={() => onApprove(item.id)}
              onReject={() => onReject(item.id)}
            />
          ))}
        </div>
      ) : queue.length > 0 ? (
        <div className="text-center py-8 text-zinc-400 dark:text-zinc-500">
          <p className="text-sm">No items match this filter</p>
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 space-y-2">
          <CheckCheck size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No jobs in queue</p>
          <p className="text-xs">
            Search for jobs and add high-scoring matches, or enable auto-queue for 80+ scores.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Queue Card ─────────────────────────────────────

function QueueCard({
  item,
  onApprove,
  onReject,
}: {
  item: AutoApplyQueueItem
  onApprove: () => void
  onReject: () => void
}) {
  const status = STATUS_STYLES[item.status] || STATUS_STYLES.pending
  const isPending = item.status === "pending"
  const isProcessing = ["generating", "applying"].includes(item.status)

  // Build a FitScore-like object for the badge
  const fitScore = {
    total: item.fit_score,
    breakdown: item.score_breakdown,
    matchedSkills: [] as string[],
    missingSkills: [] as string[],
    easyApply: item.easy_apply,
  }

  const sourceColor = item.source === "Indeed" ? "#2557a7" : item.source === "Dice" ? "#0c7ff2" : "#6b7280"

  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 hover:shadow-md transition-all"
      style={{ borderLeft: `4px solid ${sourceColor}` }}
    >
      <div className="flex justify-between items-start gap-3">
        {/* Left: score + job info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <FitScoreBadge score={fitScore} size="md" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 leading-tight block">
              {item.job_title}
            </span>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {item.company}
              {item.location ? ` · ${item.location}` : ""}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.salary && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  {item.salary}
                </span>
              )}
              {item.easy_apply && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Easy Apply
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: status + actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded flex items-center gap-1 ${status.bg} ${status.text}`}>
            {isProcessing && <Loader2 size={10} className="animate-spin" />}
            {item.status === "applied" && <Check size={10} />}
            {item.status === "failed" && <X size={10} />}
            {status.label}
          </span>

          {isPending && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onApprove}
                className="text-[10px] font-semibold px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 transition-colors flex items-center gap-1"
              >
                <Check size={10} /> Approve
              </button>
              <button
                type="button"
                onClick={onReject}
                className="text-[10px] font-semibold px-2 py-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <X size={10} /> Reject
              </button>
            </div>
          )}

          {item.job_url && (
            <a
              href={item.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              <ExternalLink size={10} /> View Job
            </a>
          )}

          {item.application_id && item.status === "applied" && (
            <span className="text-[10px] text-emerald-500 dark:text-emerald-400">
              View Application
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
