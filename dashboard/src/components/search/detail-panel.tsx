"use client"

import { useEffect, useRef } from "react"
import { ExternalLink, X, Briefcase, MapPin, Calendar, Zap } from "lucide-react"
import { TrackButton } from "@/components/search/track-button"
import type { JobSearchResultRow, JobSearchResultUpdate } from "@/types/supabase"

interface DetailPanelProps {
  row: JobSearchResultRow | null
  onClose: () => void
  onUpdateRow: (id: string, updates: JobSearchResultUpdate) => Promise<{ error: unknown }>
}

/** JSONB columns can be string[], string, or null depending on what the LLM returned. */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
  if (typeof value === "string" && value.trim()) return [value]
  return []
}

export function DetailPanel({ row, onClose, onUpdateRow }: DetailPanelProps) {
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

        {/* THE screenshot fix: a clickable apply link, rendered as a primary
            button with the external-link icon. Previously the Indeed detail
            panel had no link at all. */}
        <div className="flex items-center gap-2">
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
