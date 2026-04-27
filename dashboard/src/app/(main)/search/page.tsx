"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useSearchResults } from "@/hooks/use-search-results"
import { useSearchProfiles } from "@/hooks/use-search-profiles"
import { useSuggestions } from "@/hooks/use-suggestions"
import { useAutoApplyQueue } from "@/hooks/use-auto-apply-queue"
import { useSkillsInventory } from "@/hooks/use-skills-inventory"
import { ResultRow } from "@/components/search/result-row"
import { DetailPanel } from "@/components/search/detail-panel"
import { SuggestionsFeed } from "@/components/search/suggestions-feed"
import { AutoApplyQueue } from "@/components/search/auto-apply-queue"
import { EmptyState } from "@/components/shared/empty-state"
import { scoreJob } from "@/lib/fit-scoring"
import { Mail, ListChecks, SearchX } from "lucide-react"
import type { JobSearchResultRow } from "@/types/supabase"
import type { FitScore } from "@/types"
import type { SearchResultStatus } from "@/lib/search-results/filters"

type ActiveTab = "search" | "suggestions" | "queue"

const STATUS_OPTIONS: { value: SearchResultStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "all", label: "All Active" },
  { value: "viewed", label: "Viewed" },
  { value: "tracked", label: "Tracked" },
  { value: "stale", label: "Stale" },
]

const SOURCE_OPTIONS: { value: "all" | "indeed" | "dice"; label: string }[] = [
  { value: "all", label: "All Sources" },
  { value: "indeed", label: "Indeed" },
  { value: "dice", label: "Dice" },
]

export default function SearchPage() {
  const searchParams = useSearchParams()
  const initialTab: ActiveTab = (() => {
    const tab = searchParams?.get("tab")
    if (tab === "suggestions" || tab === "queue") return tab
    return "search"
  })()

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab)
  const [statusFilter, setStatusFilter] = useState<SearchResultStatus | "all">("new")
  const [sourceFilter, setSourceFilter] = useState<"all" | "indeed" | "dice">("all")
  const [profileFilter, setProfileFilter] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<JobSearchResultRow | null>(null)

  const filters = useMemo(
    () => ({ status: statusFilter, source: sourceFilter, profileId: profileFilter ?? undefined }),
    [statusFilter, sourceFilter, profileFilter]
  )

  const { rows, allRows, loading, updateRow } = useSearchResults(filters)
  const { profiles } = useSearchProfiles()

  // Suggestions tab — preserved from the legacy page (CAR-78).
  const {
    suggestions, loading: suggestionsLoading, newCount: suggestionsNewCount,
    extractSuggestions, dismissSuggestion, trackSuggestion, bulkDismiss,
  } = useSuggestions()

  // Auto-Apply tab — preserved from the legacy page (CAR-18).
  const { skills } = useSkillsInventory()
  const {
    queue: autoApplyQueue, loading: queueLoading, counts: queueCounts,
    addToQueue, approveJob, rejectJob, approveAllAbove, clearRejected, isInQueue,
  } = useAutoApplyQueue()

  const suggestionScores = useMemo(() => {
    const map = new Map<string, FitScore>()
    for (const s of suggestions) {
      const key = `${s.title}|||${s.company}`.toLowerCase()
      map.set(key, scoreJob({
        title: s.title,
        company: s.company,
        location: s.location || "",
        salary: s.salary || "Not listed",
        source: s.source || "",
      }, skills))
    }
    return map
  }, [suggestions, skills])

  function getSuggestionFitScore(s: { title: string; company: string }): FitScore | undefined {
    return suggestionScores.get(`${s.title}|||${s.company}`.toLowerCase())
  }

  function handleSuggestionQueue(s: { title: string; company: string; location: string | null; salary: string | null; source: string; job_url: string | null }) {
    const score = getSuggestionFitScore(s)
    if (!score) return
    addToQueue({
      title: s.title,
      company: s.company,
      location: s.location || "",
      salary: s.salary || "Not listed",
      url: s.job_url || "",
      source: `${s.source} Suggestion` as "Indeed" | "Dice",
      posted: "",
      type: "",
      profileId: "",
      profileLabel: "Suggestion",
    }, score)
  }

  function isSuggestionInQueue(s: { title: string; company: string }): boolean {
    return isInQueue({ title: s.title, company: s.company })
  }

  // Auto-extract suggestions on first load (preserved from legacy page).
  useEffect(() => {
    extractSuggestions().catch(() => {})
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect ?tab= changes (e.g., navigation from the Overview Auto-Apply widget).
  useEffect(() => {
    const tab = searchParams?.get("tab")
    if (tab === "suggestions" || tab === "queue" || tab === "search") {
      setActiveTab(tab as ActiveTab)
    }
  }, [searchParams])

  const newCount = allRows.filter((r) => r.status === "new").length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Job Search</h2>
        <div className="text-xs text-zinc-500">
          The CLI runs daily on the workstation. Track results below.
        </div>
      </div>

      {/* Tab nav (preserved) */}
      <div className="flex items-center gap-0 border-b border-zinc-200 dark:border-zinc-700">
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "search"
              ? "border-amber-500 text-amber-700 dark:text-amber-400"
              : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Results
          {newCount > 0 && (
            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
              {newCount} new
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("suggestions")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "suggestions"
              ? "border-amber-500 text-amber-700 dark:text-amber-400"
              : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <Mail size={14} />
          Suggestions
          {suggestionsNewCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
              {suggestionsNewCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "queue"
              ? "border-amber-500 text-amber-700 dark:text-amber-400"
              : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <ListChecks size={14} />
          Auto-Apply
          {queueCounts.pending > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
              {queueCounts.pending}
            </span>
          )}
        </button>
      </div>

      {activeTab === "suggestions" && (
        <SuggestionsFeed
          suggestions={suggestions}
          loading={suggestionsLoading}
          newCount={suggestionsNewCount}
          onExtract={extractSuggestions}
          onDismiss={dismissSuggestion}
          onTrack={(id) => { trackSuggestion(id) }}
          onBulkDismiss={bulkDismiss}
          getFitScore={getSuggestionFitScore}
          onAddToQueue={handleSuggestionQueue}
          isInQueue={isSuggestionInQueue}
        />
      )}

      {activeTab === "queue" && (
        <AutoApplyQueue
          queue={autoApplyQueue}
          loading={queueLoading}
          counts={queueCounts}
          onApprove={approveJob}
          onReject={rejectJob}
          onApproveAllAbove={approveAllAbove}
          onClearRejected={clearRejected}
          onGenerateBatch={async (ids) => {
            const resp = await fetch("/api/auto-apply/generate-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ queueIds: ids }),
            })
            if (!resp.ok) throw new Error("Batch generation failed")
          }}
          onStartSession={async (ids) => {
            const resp = await fetch("/api/auto-apply/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ queueIds: ids }),
            })
            if (!resp.ok) throw new Error("Failed to start session")
          }}
          onStopSession={async () => {
            const applyingIds = autoApplyQueue
              .filter((q) => q.status === "applying")
              .map((q) => q.id)
            for (const id of applyingIds) {
              await fetch("/api/auto-apply/session", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queueId: id, status: "skipped", error: "Session stopped by user" }),
              })
            }
          }}
        />
      )}

      {activeTab === "search" && (
        <div className="space-y-4">
          {/* Filter controls */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SearchResultStatus | "all")}
              aria-label="Filter by status"
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "all" | "indeed" | "dice")}
              aria-label="Filter by source"
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={profileFilter ?? ""}
              onChange={(e) => setProfileFilter(e.target.value || null)}
              aria-label="Filter by profile"
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
            >
              <option value="">All Profiles</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="ml-auto text-xs text-zinc-500">
              {loading ? "Loading…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {/* Results list */}
          {!loading && rows.length === 0 && (
            <EmptyState
              icon={SearchX}
              title="No search results yet"
              description={
                allRows.length === 0
                  ? "The CLI runs daily; check back tomorrow, or run python -m cli search run-profiles on the workstation."
                  : "No results match the current filters. Try widening the status or source filters."
              }
            />
          )}

          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((row) => (
                <ResultRow
                  key={row.id}
                  row={row}
                  selected={selectedRow?.id === row.id}
                  onSelect={setSelectedRow}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <DetailPanel
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onUpdateRow={updateRow}
      />
    </div>
  )
}
