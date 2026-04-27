"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useSearchResults } from "@/hooks/use-search-results"
import { useSearchProfiles } from "@/hooks/use-search-profiles"
import { useSuggestions } from "@/hooks/use-suggestions"
import { useAutoApplyQueue } from "@/hooks/use-auto-apply-queue"
import { useSkillsInventory } from "@/hooks/use-skills-inventory"
import { useApplications } from "@/hooks/use-applications"
import { ResultRow } from "@/components/search/result-row"
import { DetailPanel } from "@/components/search/detail-panel"
import { SuggestionsFeed } from "@/components/search/suggestions-feed"
import { AutoApplyQueue } from "@/components/search/auto-apply-queue"
import { TailorModal } from "@/components/applications/tailor-modal"
import { CoverLetterModal } from "@/components/applications/cover-letter-modal"
import { ApplyFlow } from "@/components/search/apply-flow"
import { EmptyState } from "@/components/shared/empty-state"
import { scoreJob } from "@/lib/fit-scoring"
import { rowToJob } from "@/lib/search-results/to-job"
import { buildApplicationInput } from "@/lib/search-results/track-input"
import { Mail, ListChecks, SearchX } from "lucide-react"
import type { JobSearchResultRow } from "@/types/supabase"
import type { Job, FitScore } from "@/types"
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

  // ── Modal state ───────────────────────────────────────────────────────────
  const [tailorRow, setTailorRow] = useState<JobSearchResultRow | null>(null)
  const [tailorOpen, setTailorOpen] = useState(false)
  // When Track+Tailor runs first, the new application id is stored here so
  // TailorModal.onSave can attach the resume directly to the application.
  const [tailorApplicationId, setTailorApplicationId] = useState<string | null>(null)

  const [coverLetterRow, setCoverLetterRow] = useState<JobSearchResultRow | null>(null)
  const [coverLetterOpen, setCoverLetterOpen] = useState(false)

  const [applyRow, setApplyRow] = useState<JobSearchResultRow | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)

  // Stash refs: allow tailor/cover-letter before the user clicks Track.
  // When Track fires, the stashed content is attached to the new application.
  const tailoredResumesRef = useRef<Map<string, string>>(new Map())
  const coverLettersRef = useRef<Map<string, string>>(new Map())

  const filters = useMemo(
    () => ({ status: statusFilter, source: sourceFilter, profileId: profileFilter ?? undefined }),
    [statusFilter, sourceFilter, profileFilter]
  )

  const { rows, allRows, loading, updateRow } = useSearchResults(filters)
  const { profiles } = useSearchProfiles()
  const { addApplication, updateApplication } = useApplications()

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

  // Per-row fit scores (keyed by row.id).
  const rowFitScores = useMemo(() => {
    const map = new Map<string, FitScore>()
    for (const row of rows) {
      map.set(row.id, scoreJob(rowToJob(row), skills))
    }
    return map
  }, [rows, skills])

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

  // ── Per-row handlers ──────────────────────────────────────────────────────

  // Track: create application + stamp row (no navigation — panel's TrackButton
  // handles the navigate-to-research UX; this is the lightweight list-level version).
  async function handleTrack(row: JobSearchResultRow): Promise<string | null> {
    if (row.application_id) return row.application_id
    const input = buildApplicationInput(row)
    // Attach any pre-tailored resume or cover letter from the stash refs.
    const stashedResume = tailoredResumesRef.current.get(row.id)
    const stashedCover = coverLettersRef.current.get(row.id)
    const result = await addApplication(
      {
        ...input,
        ...(stashedResume ? { tailored_resume: stashedResume } : {}),
        ...(stashedCover ? { cover_letter: stashedCover } : {}),
      },
      "search"
    )
    const newId = result?.data?.id ?? null
    if (newId) {
      await updateRow(row.id, { status: "tracked", application_id: newId })
      tailoredResumesRef.current.delete(row.id)
      coverLettersRef.current.delete(row.id)
    }
    return newId
  }

  function handleTailor(row: JobSearchResultRow) {
    setTailorRow(row)
    setTailorApplicationId(row.application_id ?? null)
    setTailorOpen(true)
  }

  function handleCoverLetter(row: JobSearchResultRow) {
    setCoverLetterRow(row)
    setCoverLetterOpen(true)
  }

  function handleApply(row: JobSearchResultRow) {
    setApplyRow(row)
    setApplyOpen(true)
  }

  async function handleApplied(job: Job) {
    if (!applyRow) return
    const existingAppId = applyRow.application_id
    if (existingAppId) {
      await updateApplication(existingAppId, {
        status: "applied",
        date_applied: new Date().toISOString().slice(0, 10),
      })
    } else {
      // Not yet tracked — create application with applied status.
      const result = await addApplication(
        {
          ...buildApplicationInput(applyRow),
          status: "applied",
          date_applied: new Date().toISOString().slice(0, 10),
        },
        "search"
      )
      const newId = result?.data?.id
      if (newId) {
        await updateRow(applyRow.id, { status: "tracked", application_id: newId })
      }
    }
    void job // consumed by ApplyFlow; application update is row-based above
  }

  async function handleTrackAndTailor(row: JobSearchResultRow) {
    const newId = await handleTrack(row)
    setTailorRow(row)
    setTailorApplicationId(newId)
    setTailorOpen(true)
  }

  function handleAddToQueue(row: JobSearchResultRow) {
    const job = rowToJob(row)
    const fitScore = rowFitScores.get(row.id)
    if (!fitScore) return
    addToQueue(job, fitScore)
  }

  function isRowInQueue(row: JobSearchResultRow): boolean {
    return isInQueue({ title: row.title ?? "", company: row.company ?? "" })
  }

  // TailorModal.onSave: stash the resume into the ref (for pre-track tailor),
  // and if an application already exists, persist it directly.
  async function handleTailorSave(resume: string) {
    if (!tailorRow) return
    tailoredResumesRef.current.set(tailorRow.id, resume)
    const appId = tailorApplicationId ?? tailorRow.application_id
    if (appId) {
      await updateApplication(appId, { tailored_resume: resume })
    }
  }

  async function handleCoverLetterSave(letter: string) {
    if (!coverLetterRow) return
    coverLettersRef.current.set(coverLetterRow.id, letter)
    const appId = coverLetterRow.application_id
    if (appId) {
      await updateApplication(appId, { cover_letter: letter })
    }
  }

  const newCount = allRows.filter((r) => r.status === "new").length

  // Active row's fit score (for DetailPanel's isInQueue check).
  const selectedFitScore = selectedRow ? rowFitScores.get(selectedRow.id) : undefined

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
                  onTrack={(r) => { void handleTrack(r) }}
                  onApply={handleApply}
                  onTailor={handleTailor}
                  onCoverLetter={handleCoverLetter}
                  onTrackAndTailor={(r) => { void handleTrackAndTailor(r) }}
                  onAddToQueue={handleAddToQueue}
                  isInQueue={isRowInQueue}
                  fitScore={rowFitScores.get(row.id)}
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
        onTailor={handleTailor}
        onCoverLetter={handleCoverLetter}
        onApply={handleApply}
        onAddToQueue={handleAddToQueue}
        onTrackAndTailor={(r) => { void handleTrackAndTailor(r) }}
        fitScore={selectedFitScore}
        isInQueue={selectedRow ? isRowInQueue(selectedRow) : false}
      />

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {tailorRow && (
        <TailorModal
          application={{
            title: tailorRow.title ?? "",
            company: tailorRow.company ?? "",
            url: tailorRow.url,
            tailored_resume: tailoredResumesRef.current.get(tailorRow.id) ?? null,
          }}
          open={tailorOpen}
          onOpenChange={(open) => {
            setTailorOpen(open)
            if (!open) {
              setTailorRow(null)
              setTailorApplicationId(null)
            }
          }}
          onSave={handleTailorSave}
        />
      )}

      {coverLetterRow && (
        <CoverLetterModal
          application={{
            title: coverLetterRow.title ?? "",
            company: coverLetterRow.company ?? "",
            url: coverLetterRow.url,
          }}
          open={coverLetterOpen}
          onOpenChange={(open) => {
            setCoverLetterOpen(open)
            if (!open) setCoverLetterRow(null)
          }}
          onSave={handleCoverLetterSave}
        />
      )}

      {applyRow && (
        <ApplyFlow
          job={rowToJob(applyRow)}
          isOpen={applyOpen}
          onClose={() => {
            setApplyOpen(false)
            setApplyRow(null)
          }}
          onApplied={handleApplied}
          tailoredResume={tailoredResumesRef.current.get(applyRow.id) ?? null}
          coverLetter={coverLettersRef.current.get(applyRow.id) ?? null}
        />
      )}
    </div>
  )
}
