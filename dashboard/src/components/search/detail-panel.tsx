"use client"

import { useEffect, useRef } from "react"
import { ExternalLink, X, Briefcase, MapPin, Calendar, Zap, Sparkles, FileText, ListPlus, Send } from "lucide-react"
import { TrackButton } from "@/components/search/track-button"
import type { JobSearchResultRow, JobSearchResultUpdate } from "@/types/supabase"
import type { FitScore } from "@/types"

interface DetailPanelProps {
  row: JobSearchResultRow | null
  onClose: () => void
  onUpdateRow: (id: string, updates: JobSearchResultUpdate) => Promise<{ error: unknown }>
  onTailor?: (row: JobSearchResultRow) => void
  onCoverLetter?: (row: JobSearchResultRow) => void
  onApply?: (row: JobSearchResultRow) => void
  onAddToQueue?: (row: JobSearchResultRow) => void
  onTrackAndTailor?: (row: JobSearchResultRow) => void
  fitScore?: FitScore
  isInQueue?: boolean
}

/** JSONB columns can be string[], string, or null depending on what the LLM returned. */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
  if (typeof value === "string" && value.trim()) return [value]
  return []
}

export function DetailPanel({
  row,
  onClose,
  onUpdateRow,
  onTailor,
  onCoverLetter,
  onApply,
  onAddToQueue,
  onTrackAndTailor,
  fitScore: _fitScore,
  isInQueue,
}: DetailPanelProps) {
  const flippedRef = useRef<string | null>(null)

  // First-open status flip: new → viewed (per plan Test scenario "First-open status flip").
  // Guarded by a ref so re-renders for the same row don't re-write; status check
  // makes it idempotent if the realtime update hasn't propagated yet.
  useEffect(() => {
    if (!row) return
    if (row.status !== "new") return
    if (flippedRef.current === row.id) return
    flippedRef.current = row.id
    void onUpdateRow(row.id, { status: "viewed" })
  }, [row, onUpdateRow])

  if (!row) return null

  const requirements = asStringArray(row.requirements)
  const niceToHaves = asStringArray(row.nice_to_haves)
  const description = row.description?.trim() ?? ""

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-y-auto">
      <header className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100 truncate">
            {row.title || "Untitled"}
          </h2>
          <div className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400 truncate">
            {row.company || "Unknown company"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          <X size={18} />
        </button>
      </header>

      <div className="px-5 py-4 space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          {row.location && (
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {row.location}
            </span>
          )}
          {row.salary && (
            <span className="flex items-center gap-1">
              <Briefcase size={12} /> {row.salary}
            </span>
          )}
          {row.posted_date && (
            <span className="flex items-center gap-1">
              <Calendar size={12} /> {row.posted_date}
            </span>
          )}
          {row.easy_apply && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Zap size={12} /> Easy Apply
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {row.source}
          </span>
        </div>

        {/* Primary actions: external apply link + Track */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            Apply on {row.source}
            <ExternalLink size={14} />
          </a>
          <TrackButton row={row} onUpdateRow={onUpdateRow} />
        </div>

        {/* Secondary actions: Tailor / Cover Letter / Apply flow / Track+Tailor / Queue */}
        {(onApply || onTailor || onCoverLetter || onTrackAndTailor || onAddToQueue) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onApply && (
              <button
                type="button"
                onClick={() => onApply(row)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  row.easy_apply
                    ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                }`}
              >
                {row.easy_apply ? <Zap size={12} /> : <Send size={12} />}
                Apply Flow
              </button>
            )}
            {onTailor && (
              <button
                type="button"
                onClick={() => onTailor(row)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors"
              >
                <Sparkles size={12} /> Tailor Resume
              </button>
            )}
            {onCoverLetter && (
              <button
                type="button"
                onClick={() => onCoverLetter(row)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors"
              >
                <FileText size={12} /> Cover Letter
              </button>
            )}
            {onTrackAndTailor && !row.application_id && (
              <button
                type="button"
                onClick={() => onTrackAndTailor(row)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                <Briefcase size={12} />
                <Sparkles size={12} />
                Track + Tailor
              </button>
            )}
            {onAddToQueue && (
              isInQueue ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                  <ListPlus size={12} /> Queued
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddToQueue(row)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors"
                >
                  <ListPlus size={12} /> Add to Queue
                </button>
              )
            )}
          </div>
        )}

        {description ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Description
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
              {description}
            </p>
          </section>
        ) : (
          <section className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No description scraped yet. The CLI enrichment loop will populate this
              on the next run; the apply link above still works.
            </p>
          </section>
        )}

        {requirements.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Requirements
            </h3>
            <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
              {requirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </section>
        )}

        {niceToHaves.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Nice to Have
            </h3>
            <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
              {niceToHaves.map((nice, i) => (
                <li key={i}>{nice}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}
