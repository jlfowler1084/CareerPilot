"use client"

import { useState, useMemo } from "react"
import { Check, X, CheckCheck, Trash2, ExternalLink, Loader2, FileText, Sparkles, Play, Square, Copy, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
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
  onGenerateBatch?: (ids: string[]) => Promise<void>
  onStartSession?: (ids: string[]) => Promise<void>
  onStopSession?: () => Promise<void>
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
  onGenerateBatch,
  onStartSession,
  onStopSession,
}: AutoApplyQueueProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [generating, setGenerating] = useState(false)
  const [sessionStarting, setSessionStarting] = useState(false)
  const [sessionStopping, setSessionStopping] = useState(false)
  const [triggerCopied, setTriggerCopied] = useState(false)

  // Session state derived from queue items
  const readyCount = queue.filter((q) => q.status === "ready").length
  const applyingItems = queue.filter((q) => q.status === "applying")
  const sessionItems = queue.filter((q) => ["applying", "applied", "failed", "skipped"].includes(q.status))
  const hasActiveSession = applyingItems.length > 0
  const sessionComplete = sessionItems.length > 0 && applyingItems.length === 0 && readyCount === 0
  const sessionStats = {
    total: sessionItems.length,
    applied: sessionItems.filter((q) => q.status === "applied").length,
    failed: sessionItems.filter((q) => q.status === "failed").length,
    skipped: sessionItems.filter((q) => q.status === "skipped").length,
    remaining: applyingItems.length,
  }

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
          {onGenerateBatch && queue.some((q) => q.status === "approved") && (
            <button
              type="button"
              disabled={generating}
              onClick={async () => {
                const ids = queue.filter((q) => q.status === "approved").map((q) => q.id)
                if (ids.length === 0) return
                setGenerating(true)
                try {
                  await onGenerateBatch(ids)
                  toast.success(`Generated materials for ${ids.length} job${ids.length !== 1 ? "s" : ""}`)
                } catch {
                  toast.error("Batch generation failed")
                } finally {
                  setGenerating(false)
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generating ? "Generating..." : "Generate All"}
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

      {/* Session Panel */}
      {onStartSession && readyCount > 0 && !hasActiveSession && !sessionComplete && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{readyCount} job{readyCount !== 1 ? "s" : ""} ready to apply</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Start a session to begin auto-applying via Claude in Chrome</p>
            </div>
            <button
              type="button"
              disabled={sessionStarting}
              onClick={async () => {
                const ids = queue.filter((q) => q.status === "ready").map((q) => q.id)
                setSessionStarting(true)
                try {
                  await onStartSession(ids)
                  toast.success(`Session started with ${ids.length} jobs`)
                } catch {
                  toast.error("Failed to start session")
                } finally {
                  setSessionStarting(false)
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {sessionStarting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Start Apply Session
            </button>
          </div>
        </div>
      )}

      {hasActiveSession && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              Applying... {sessionStats.applied + sessionStats.failed + sessionStats.skipped}/{sessionStats.total} complete
            </p>
            {onStopSession && (
              <button
                type="button"
                disabled={sessionStopping}
                onClick={async () => {
                  setSessionStopping(true)
                  try {
                    await onStopSession()
                    toast.success("Session stopped")
                  } catch {
                    toast.error("Failed to stop session")
                  } finally {
                    setSessionStopping(false)
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {sessionStopping ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                Stop Session
              </button>
            )}
          </div>
          {/* Progress bar */}
          <div className="w-full h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${sessionStats.total > 0 ? ((sessionStats.applied + sessionStats.failed + sessionStats.skipped) / sessionStats.total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
            Applied: {sessionStats.applied} | Failed: {sessionStats.failed} | Skipped: {sessionStats.skipped} | Remaining: {sessionStats.remaining}
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2">Go to Claude.ai and say:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-zinc-100 dark:bg-zinc-700 px-3 py-1.5 rounded font-mono text-zinc-800 dark:text-zinc-200 flex-1">
                Apply to my queued jobs
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText("Apply to my queued jobs")
                  setTriggerCopied(true)
                  setTimeout(() => setTriggerCopied(false), 2000)
                }}
                className="text-[10px] px-2 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 transition-colors flex items-center gap-1"
              >
                {triggerCopied ? <Check size={10} /> : <Copy size={10} />}
                {triggerCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionComplete && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-1">Session Complete</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {sessionStats.applied} applied · {sessionStats.failed} failed · {sessionStats.skipped} skipped
          </p>
        </div>
      )}

      {/* Queue items */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              onApprove={() => onApprove(item.id)}
              onReject={() => onReject(item.id)}
              onGenerate={onGenerateBatch ? async () => {
                await onGenerateBatch([item.id])
              } : undefined}
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
  onGenerate,
}: {
  item: AutoApplyQueueItem
  onApprove: () => void
  onReject: () => void
  onGenerate?: () => Promise<void>
}) {
  const [genLoading, setGenLoading] = useState(false)
  const status = STATUS_STYLES[item.status] || STATUS_STYLES.pending
  const isPending = item.status === "pending"
  const isApproved = item.status === "approved"
  const isReady = item.status === "ready"
  const isProcessing = ["generating", "applying"].includes(item.status)

  // Build a FitScore-like object for the badge
  const fitScore = {
    total: item.fit_score ?? 0,
    breakdown: item.score_breakdown ?? { title: 0, skills: 0, location: 0, salary: 0 },
    matchedSkills: [] as string[],
    missingSkills: [] as string[],
    easyApply: item.easy_apply ?? false,
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

          {isApproved && onGenerate && (
            <button
              type="button"
              disabled={genLoading}
              onClick={async () => {
                setGenLoading(true)
                try {
                  await onGenerate()
                  toast.success("Materials generated")
                } catch {
                  toast.error("Generation failed")
                } finally {
                  setGenLoading(false)
                }
              }}
              className="text-[10px] font-semibold px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {genLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              {genLoading ? "Generating..." : "Generate Materials"}
            </button>
          )}

          {(isReady || item.status === "applied") && (
            <div className="flex items-center gap-1.5">
              {item.tailored_resume_url && (
                <a
                  href={item.tailored_resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 flex items-center gap-1"
                >
                  <FileText size={9} /> Resume
                </a>
              )}
              {item.cover_letter_url && (
                <a
                  href={item.cover_letter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 flex items-center gap-1"
                >
                  <FileText size={9} /> Cover Letter
                </a>
              )}
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

          {item.status === "failed" && item.error_message && (
            <p className="text-[10px] text-red-500 dark:text-red-400 max-w-[200px] text-right" title={item.error_message}>
              {item.error_message.length > 60 ? item.error_message.slice(0, 60) + "..." : item.error_message}
            </p>
          )}

          {(item.status === "applied" || item.status === "failed") && (
            <LogViewer queueId={item.id} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Log Viewer ─────────────────────────────────────

function LogViewer({ queueId }: { queueId: string }) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<Array<{ action: string; success: boolean; details: Record<string, unknown>; created_at: string }>>([])
  const [loading, setLoading] = useState(false)

  async function loadLogs() {
    if (logs.length > 0) {
      setOpen(!open)
      return
    }
    setLoading(true)
    setOpen(true)
    try {
      const resp = await fetch(`/api/auto-apply/log?queueId=${queueId}`)
      if (resp.ok) {
        const data = await resp.json()
        setLogs(data.logs || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={loadLogs}
        className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        View Log
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 max-w-[220px]">
          {loading && <Loader2 size={10} className="animate-spin text-zinc-400" />}
          {!loading && logs.length === 0 && (
            <p className="text-[9px] text-zinc-400">No logs recorded</p>
          )}
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className={`text-[9px] mt-0.5 ${log.success ? "text-emerald-500" : "text-red-500"}`}>
                {log.success ? "+" : "x"}
              </span>
              <span className="text-[9px] text-zinc-500 dark:text-zinc-400">
                {log.action}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
