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
import { CustomSearchBar } from "@/components/search/custom-search-bar"
import { ProfileChips } from "@/components/search/profile-chips"
import { SearchFiltersBar, DEFAULT_FILTERS } from "@/components/search/search-filters"
import { AdvancedFiltersPanel } from "@/components/search/advanced-filters"
import { QueryMode, QueryModeToggle } from "@/components/search/query-mode"
import { SuggestionsFeed } from "@/components/search/suggestions-feed"
import { AutoApplyQueue } from "@/components/search/auto-apply-queue"
import { TailorModal } from "@/components/applications/tailor-modal"
import { CoverLetterModal } from "@/components/applications/cover-letter-modal"
import { ApplyFlow } from "@/components/search/apply-flow"
import { EmptyState } from "@/components/shared/empty-state"
import { scoreJob } from "@/lib/fit-scoring"
import { rowToJob } from "@/lib/search-results/to-job"
import { buildApplicationInput } from "@/lib/search-results/track-input"
import { rowsToAutoQueue } from "@/lib/search-results/auto-queue"
import { applyFilters } from "@/lib/search-filter-utils"
import { applyAdvancedFilters, DEFAULT_ADVANCED_FILTERS } from "@/lib/search-filter-utils"
import { applyQueryFilter, parseQuery } from "@/lib/query-parser"
import { parseSalary } from "@/lib/search-filter-utils"
import { Mail, ListChecks, SearchX, ListFilter, X } from "lucide-react"
import type { JobSearchResultRow } from "@/types/supabase"
import type { Job, FitScore } from "@/types"
import type { SearchFilters } from "@/lib/search-filter-utils"
import type { AdvancedFilters } from "@/lib/search-filter-utils"
import type { SearchResultStatus } from "@/lib/search-results/filters"
import type { SearchProfile } from "@/hooks/use-search-profiles"

type ActiveTab = "search" | "suggestions" | "queue"
type SortOrder = "newest" | "fit" | "salary" | "company"

const STATUS_OPTIONS: { value: SearchResultStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "all", label: "All Active" },
  { value: "viewed", label: "Viewed" },
  { value: "tracked", label: "Tracked" },
  { value: "stale", label: "Stale" },
]

const HIDDEN_PROFILES_KEY = "careerpilot_hidden_profiles"
const AUTO_QUEUE_KEY = "careerpilot_auto_queue_enabled"

function loadLocalSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveLocalSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])) } catch {}
}

export default function SearchPage() {
  const searchParams = useSearchParams()
  const initialTab: ActiveTab = (() => {
    const tab = searchParams?.get("tab")
    if (tab === "suggestions" || tab === "queue") return tab
    return "search"
  })()

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab)
  const [statusFilter, setStatusFilter] = useState<SearchResultStatus | "all">("new")
  const [selectedRow, setSelectedRow] = useState<JobSearchResultRow | null>(null)

  // ── B1: Profile chips state ───────────────────────────────────────────────
  // Empty set = all profiles shown. Non-empty = filter to those IDs.
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  const [hiddenProfileIds, setHiddenProfileIds] = useState<Set<string>>(() => loadLocalSet(HIDDEN_PROFILES_KEY))

  // ── B2: Filter state ──────────────────────────────────────────────────────
  const [quickFilters, setQuickFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(DEFAULT_ADVANCED_FILTERS)
  const [queryMode, setQueryMode] = useState(false)
  const [queryString, setQueryString] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest")

  // ── B3: Auto-queue toggle ─────────────────────────────────────────────────
  const [autoQueueEnabled, setAutoQueueEnabled] = useState(() => {
    try { return localStorage.getItem(AUTO_QUEUE_KEY) === "true" } catch { return false }
  })

  // ── Modal state (Phase A) ─────────────────────────────────────────────────
  const [tailorRow, setTailorRow] = useState<JobSearchResultRow | null>(null)
  const [tailorOpen, setTailorOpen] = useState(false)
  const [tailorApplicationId, setTailorApplicationId] = useState<string | null>(null)
  const [coverLetterRow, setCoverLetterRow] = useState<JobSearchResultRow | null>(null)
  const [coverLetterOpen, setCoverLetterOpen] = useState(false)
  const [applyRow, setApplyRow] = useState<JobSearchResultRow | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const tailoredResumesRef = useRef<Map<string, string>>(new Map())
  const coverLettersRef = useRef<Map<string, string>>(new Map())

  // ── C2: Ad-hoc search state ───────────────────────────────────────────────
  const [adhocResults, setAdhocResults] = useState<Job[]>([])
  const [adhocLoading, setAdhocLoading] = useState(false)

  // ── Data hooks ────────────────────────────────────────────────────────────
  // Only status-filter at Supabase level; profile + quick + advanced filters run client-side.
  const { rows: statusRows, allRows, loading, updateRow } = useSearchResults(
    useMemo(() => ({ status: statusFilter }), [statusFilter])
  )

  const { profiles, createProfile, updateProfile, deleteProfile } = useSearchProfiles()
  const { addApplication, updateApplication } = useApplications()

  const {
    suggestions, loading: suggestionsLoading, newCount: suggestionsNewCount,
    extractSuggestions, dismissSuggestion, trackSuggestion, bulkDismiss,
  } = useSuggestions()

  const { skills } = useSkillsInventory()
  const {
    queue: autoApplyQueue, loading: queueLoading, counts: queueCounts,
    addToQueue, approveJob, rejectJob, approveAllAbove, clearRejected, isInQueue,
  } = useAutoApplyQueue()

  // ── Fit scores (computed for ALL rows so sort-by-fit + auto-queue work) ───
  const rowFitScores = useMemo(() => {
    const map = new Map<string, FitScore>()
    for (const row of allRows) {
      map.set(row.id, scoreJob(rowToJob(row), skills))
    }
    return map
  }, [allRows, skills])

  // ── B2: Full client-side filter pipeline ──────────────────────────────────
  const displayRows = useMemo(() => {
    // Step 1: Profile filter
    const profileFiltered =
      selectedProfileIds.size === 0
        ? statusRows
        : statusRows.filter((r) => r.profile_id && selectedProfileIds.has(r.profile_id))

    // Step 2: Convert to Job[] — done once; same object refs used by all filters
    const jobs: Job[] = profileFiltered.map(rowToJob)
    // Map from Job object reference → its source row (for zip-back after filtering)
    const jobToRow = new Map<Job, JobSearchResultRow>(
      profileFiltered.map((row, i) => [jobs[i], row])
    )

    // Step 3: Apply quick / advanced / query filters
    let filtered: Job[]
    if (queryMode && queryString.trim()) {
      filtered = applyQueryFilter(jobs, parseQuery(queryString))
    } else {
      filtered = applyAdvancedFilters(applyFilters(jobs, quickFilters), advancedFilters)
    }

    // Step 4: Zip back to rows (Array.filter preserves object references)
    const filteredRows = filtered
      .map((j) => jobToRow.get(j))
      .filter((r): r is JobSearchResultRow => r !== undefined)

    // Step 5: Sort
    switch (sortOrder) {
      case "newest":
        filteredRows.sort(
          (a, b) =>
            new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()
        )
        break
      case "fit":
        filteredRows.sort(
          (a, b) => (rowFitScores.get(b.id)?.total ?? 0) - (rowFitScores.get(a.id)?.total ?? 0)
        )
        break
      case "salary":
        filteredRows.sort((a, b) => {
          const sa = parseSalary(a.salary ?? "")?.annual ?? 0
          const sb = parseSalary(b.salary ?? "")?.annual ?? 0
          return sb - sa
        })
        break
      case "company":
        filteredRows.sort((a, b) =>
          (a.company ?? "").localeCompare(b.company ?? "")
        )
        break
    }

    return filteredRows
  }, [statusRows, selectedProfileIds, quickFilters, advancedFilters, queryMode, queryString, sortOrder, rowFitScores])

  // Jobs after profile-filter only (for AdvancedFiltersPanel company autocomplete)
  const jobsForAdvancedFilter = useMemo(() => {
    const profileFiltered =
      selectedProfileIds.size === 0
        ? statusRows
        : statusRows.filter((r) => r.profile_id && selectedProfileIds.has(r.profile_id))
    return profileFiltered.map(rowToJob)
  }, [statusRows, selectedProfileIds])

  // ── B3: Scan metadata derived from allRows ────────────────────────────────
  const scanMetadata = useMemo(() => {
    if (allRows.length === 0) return null
    const latest = allRows.reduce(
      (max, r) => (r.discovered_at > max ? r.discovered_at : max),
      ""
    )
    const newCount = allRows.filter((r) => r.status === "new").length
    return { latest, newCount }
  }, [allRows])

  // ── B3: Auto-queue 80+ effect ─────────────────────────────────────────────
  useEffect(() => {
    if (!autoQueueEnabled) return
    for (const row of rowsToAutoQueue(displayRows, rowFitScores, isInQueue)) {
      addToQueue(rowToJob(row), rowFitScores.get(row.id)!)
    }
    // Only re-run when toggle turns on or displayed rows change meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoQueueEnabled, displayRows])

  // ── Suggestion helpers (preserved from Phase A) ───────────────────────────
  const suggestionScores = useMemo(() => {
    const map = new Map<string, FitScore>()
    for (const s of suggestions) {
      const key = `${s.title}|||${s.company}`.toLowerCase()
      map.set(key, scoreJob({ title: s.title, company: s.company, location: s.location || "", salary: s.salary || "Not listed", source: s.source || "" }, skills))
    }
    return map
  }, [suggestions, skills])

  function getSuggestionFitScore(s: { title: string; company: string }): FitScore | undefined {
    return suggestionScores.get(`${s.title}|||${s.company}`.toLowerCase())
  }

  function handleSuggestionQueue(s: { title: string; company: string; location: string | null; salary: string | null; source: string; job_url: string | null }) {
    const score = getSuggestionFitScore(s)
    if (!score) return
    addToQueue({ title: s.title, company: s.company, location: s.location || "", salary: s.salary || "Not listed", url: s.job_url || "", source: `${s.source} Suggestion` as "Indeed" | "Dice", posted: "", type: "", profileId: "", profileLabel: "Suggestion" }, score)
  }

  function isSuggestionInQueue(s: { title: string; company: string }): boolean {
    return isInQueue({ title: s.title, company: s.company })
  }

  useEffect(() => {
    extractSuggestions().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tab = searchParams?.get("tab")
    if (tab === "suggestions" || tab === "queue" || tab === "search") {
      setActiveTab(tab as ActiveTab)
    }
  }, [searchParams])

  // ── B1: Profile chips handlers ────────────────────────────────────────────
  function handleToggleProfile(id: string) {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAllProfiles() {
    setSelectedProfileIds(new Set())
  }

  function handleSelectNoneProfiles() {
    // Select none = empty visible selection; pass Set of all visible IDs so the
    // filter shows nothing. Since empty = all, we need to explicitly pick none.
    const visible = profiles.filter((p) => !hiddenProfileIds.has(p.id))
    setSelectedProfileIds(new Set(visible.map((p) => p.id)))
    // Then clear — actually we want NO profiles. Let's toggle to a set that
    // contains a sentinel no real profile will match. Instead: set to a Set
    // with a dummy ID so the filter produces 0 rows.
    setSelectedProfileIds(() => {
      // All visible IDs selected for deselection:
      const all = new Set(visible.map((p) => p.id))
      // Remove all of them so filter shows nothing — but empty = all.
      // Workaround: set to {"__none__"} — no row has this profile_id.
      return new Set(["__none__"])
    })
  }

  function handleHideProfile(id: string) {
    if (id === "__show_all__") {
      const next = new Set<string>()
      setHiddenProfileIds(next)
      saveLocalSet(HIDDEN_PROFILES_KEY, next)
    } else {
      const next = new Set(hiddenProfileIds)
      next.add(id)
      setHiddenProfileIds(next)
      saveLocalSet(HIDDEN_PROFILES_KEY, next)
      // If this profile was selected, deselect it.
      setSelectedProfileIds((prev) => {
        const s = new Set(prev)
        s.delete(id)
        return s
      })
    }
  }

  function handleDuplicateProfile(profile: SearchProfile) {
    createProfile({
      name: `${profile.name} (copy)`,
      keyword: profile.keyword,
      location: profile.location,
      source: profile.source,
      contract_only: profile.contract_only,
      icon: profile.icon,
    })
  }

  // Compute the display-selected set for ProfileChips (empty = all visible)
  const profilesDisplaySelected = useMemo(() => {
    if (selectedProfileIds.size === 0) {
      return new Set(profiles.filter((p) => !hiddenProfileIds.has(p.id)).map((p) => p.id))
    }
    return selectedProfileIds
  }, [selectedProfileIds, profiles, hiddenProfileIds])

  // ── C2: Ad-hoc search handler ─────────────────────────────────────────────
  async function handleQuickSearch(keyword: string, location: string, source: string) {
    setAdhocLoading(true)
    setAdhocResults([])
    try {
      const resp = await fetch("/api/search-adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location, source, contractOnly: false }),
      })
      if (resp.status === 503) {
        const json = await resp.json()
        console.warn("[search-adhoc] rate limit:", json.error)
        return
      }
      if (!resp.ok) {
        console.error("[search-adhoc] error:", resp.status)
        return
      }
      const json = await resp.json()
      setAdhocResults((json.jobs as Job[]) ?? [])
    } finally {
      setAdhocLoading(false)
    }
  }

  // ── Per-row handlers (Phase A) ────────────────────────────────────────────
  async function handleTrack(row: JobSearchResultRow): Promise<string | null> {
    if (row.application_id) return row.application_id
    const input = buildApplicationInput(row)
    const stashedResume = tailoredResumesRef.current.get(row.id)
    const stashedCover = coverLettersRef.current.get(row.id)
    const result = await addApplication(
      { ...input, ...(stashedResume ? { tailored_resume: stashedResume } : {}), ...(stashedCover ? { cover_letter: stashedCover } : {}) },
      "search"
    )
    const newId = result?.data?.id ?? null
    if (newId) {
      if (row.id.startsWith("adhoc-")) {
        // Synthetic row: no Supabase row to update; drop it from the ad-hoc list
        // so the user can't double-track (the application now lives in /applications).
        setAdhocResults((prev) =>
          prev.filter((j) => !(j.title === (row.title ?? "") && j.company === (row.company ?? "")))
        )
      } else {
        await updateRow(row.id, { status: "tracked", application_id: newId })
      }
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
      await updateApplication(existingAppId, { status: "applied", date_applied: new Date().toISOString().slice(0, 10) })
    } else {
      const result = await addApplication({ ...buildApplicationInput(applyRow), status: "applied", date_applied: new Date().toISOString().slice(0, 10) }, "search")
      const newId = result?.data?.id
      if (newId) {
        if (applyRow.id.startsWith("adhoc-")) {
          setAdhocResults((prev) =>
            prev.filter((j) => !(j.title === (applyRow.title ?? "") && j.company === (applyRow.company ?? "")))
          )
        } else {
          await updateRow(applyRow.id, { status: "tracked", application_id: newId })
        }
      }
    }
    void job
  }

  async function handleTrackAndTailor(row: JobSearchResultRow) {
    const newId = await handleTrack(row)
    setTailorRow(row)
    setTailorApplicationId(newId)
    setTailorOpen(true)
  }

  function handleAddToQueue(row: JobSearchResultRow) {
    const job = rowToJob(row)
    // Ad-hoc rows are not in rowFitScores (computed from allRows); score inline.
    const fitScore = row.id.startsWith("adhoc-")
      ? scoreJob(job, skills)
      : rowFitScores.get(row.id)
    if (!fitScore) return
    addToQueue(job, fitScore)
  }

  function isRowInQueue(row: JobSearchResultRow): boolean {
    return isInQueue({ title: row.title ?? "", company: row.company ?? "" })
  }

  async function handleTailorSave(resume: string) {
    if (!tailorRow) return
    tailoredResumesRef.current.set(tailorRow.id, resume)
    const appId = tailorApplicationId ?? tailorRow.application_id
    if (appId) await updateApplication(appId, { tailored_resume: resume })
  }

  async function handleCoverLetterSave(letter: string) {
    if (!coverLetterRow) return
    coverLettersRef.current.set(coverLetterRow.id, letter)
    const appId = coverLetterRow.application_id
    if (appId) await updateApplication(appId, { cover_letter: letter })
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const newCount = allRows.filter((r) => r.status === "new").length
  const selectedFitScore = selectedRow ? rowFitScores.get(selectedRow.id) : undefined

  // Format a UTC ISO string as a human-readable time (e.g. "7:02 AM")
  function formatScanTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    } catch { return "" }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Job Search</h2>
        {/* B3: Scan metadata header */}
        {scanMetadata ? (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Last discovered: {formatScanTime(scanMetadata.latest)}
            {scanMetadata.newCount > 0 && (
              <span className="ml-2 font-semibold text-blue-600 dark:text-blue-400">
                {scanMetadata.newCount} new
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            The CLI runs daily on the workstation. Track results below.
          </div>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-0 border-b border-zinc-200 dark:border-zinc-700">
        <button type="button" onClick={() => setActiveTab("search")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "search" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
        >
          Results
          {newCount > 0 && (
            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
              {newCount} new
            </span>
          )}
        </button>
        <button type="button" onClick={() => setActiveTab("suggestions")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${activeTab === "suggestions" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
        >
          <Mail size={14} /> Suggestions
          {suggestionsNewCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">{suggestionsNewCount}</span>
          )}
        </button>
        <button type="button" onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${activeTab === "queue" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
        >
          <ListChecks size={14} /> Auto-Apply
          {queueCounts.pending > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">{queueCounts.pending}</span>
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
            const resp = await fetch("/api/auto-apply/generate-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIds: ids }) })
            if (!resp.ok) throw new Error("Batch generation failed")
          }}
          onStartSession={async (ids) => {
            const resp = await fetch("/api/auto-apply/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIds: ids }) })
            if (!resp.ok) throw new Error("Failed to start session")
          }}
          onStopSession={async () => {
            const applyingIds = autoApplyQueue.filter((q) => q.status === "applying").map((q) => q.id)
            for (const id of applyingIds) {
              await fetch("/api/auto-apply/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueId: id, status: "skipped", error: "Session stopped by user" }) })
            }
          }}
        />
      )}

      {activeTab === "search" && (
        <div className="space-y-4">
          {/* C2: Custom (ad-hoc) search bar */}
          <CustomSearchBar
            onQuickSearch={handleQuickSearch}
            onSaveProfile={(p) =>
              createProfile({
                name: p.name,
                keyword: p.keyword,
                location: p.location,
                source: p.source === "both" ? "dice" : p.source,
                contract_only: p.contract_only,
                icon: p.icon,
              })
            }
            disabled={adhocLoading}
          />

          {/* C2: Ad-hoc results section */}
          {(adhocLoading || adhocResults.length > 0) && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Ad-hoc results {adhocResults.length > 0 && `(${adhocResults.length})`}
                </h3>
                <button
                  type="button"
                  onClick={() => setAdhocResults([])}
                  aria-label="Clear ad-hoc results"
                  className="p-1 rounded text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                >
                  <X size={14} />
                </button>
              </div>
              {adhocLoading && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Searching Dice…</p>
              )}
              {!adhocLoading && adhocResults.length === 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">No results found.</p>
              )}
              {adhocResults.length > 0 && (
                <div className="space-y-2">
                  {adhocResults.map((job, i) => {
                    // Ad-hoc results use Job shape — synthesize a minimal row for ResultRow
                    const syntheticRow: JobSearchResultRow = {
                      id: `adhoc-${i}-${job.title}-${job.company}`.replace(/\s+/g, "-").toLowerCase(),
                      user_id: "",
                      source: job.source.toLowerCase() as "dice" | "indeed",
                      source_id: "",
                      url: job.url,
                      title: job.title,
                      company: job.company,
                      location: job.location,
                      salary: job.salary === "Not listed" ? null : job.salary,
                      job_type: job.type || null,
                      posted_date: job.posted || null,
                      easy_apply: job.easyApply ?? false,
                      profile_id: null,
                      profile_label: null,
                      description: null,
                      requirements: null,
                      nice_to_haves: null,
                      discovered_at: new Date().toISOString(),
                      last_seen_at: new Date().toISOString(),
                      last_enriched_at: null,
                      status: "new",
                      application_id: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }
                    return (
                      <ResultRow
                        key={syntheticRow.id}
                        row={syntheticRow}
                        selected={selectedRow?.id === syntheticRow.id}
                        onSelect={setSelectedRow}
                        onTrack={(r) => { void handleTrack(r) }}
                        onApply={handleApply}
                        onTailor={handleTailor}
                        onCoverLetter={handleCoverLetter}
                        onTrackAndTailor={(r) => { void handleTrackAndTailor(r) }}
                        onAddToQueue={handleAddToQueue}
                        isInQueue={isRowInQueue}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* B1: Profile chips */}
          {profiles.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
              <ProfileChips
                profiles={profiles}
                selectedProfiles={profilesDisplaySelected}
                toggleProfile={handleToggleProfile}
                selectAll={handleSelectAllProfiles}
                selectNone={handleSelectNoneProfiles}
                onEditProfile={(id, updates) => updateProfile(id, updates)}
                onDeleteProfile={(id) => deleteProfile(id)}
                onDuplicateProfile={handleDuplicateProfile}
                onHideProfile={handleHideProfile}
                hiddenProfiles={hiddenProfileIds}
              />
            </div>
          )}

          {/* B2: Filters — query mode OR quick+advanced */}
          {queryMode ? (
            <QueryMode
              queryString={queryString}
              onQueryChange={setQueryString}
              onToggle={() => { setQueryMode(false); setQueryString("") }}
              totalCount={statusRows.length}
              filteredCount={displayRows.length}
            />
          ) : (
            <div className="space-y-2">
              <SearchFiltersBar
                filters={quickFilters}
                onFiltersChange={setQuickFilters}
                totalCount={statusRows.length}
                filteredCount={displayRows.length}
              />
              <div className="flex items-center justify-between px-1">
                <AdvancedFiltersPanel
                  filters={advancedFilters}
                  onFiltersChange={setAdvancedFilters}
                  jobs={jobsForAdvancedFilter}
                />
                <QueryModeToggle onClick={() => setQueryMode(true)} />
              </div>
            </div>
          )}

          {/* Status filter + sort + result count row */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SearchResultStatus | "all")}
              aria-label="Filter by status"
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* B3: Auto-queue toggle */}
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-zinc-500 dark:text-zinc-400 select-none">
              <input
                type="checkbox"
                checked={autoQueueEnabled}
                onChange={(e) => {
                  const v = e.target.checked
                  setAutoQueueEnabled(v)
                  try { localStorage.setItem(AUTO_QUEUE_KEY, String(v)) } catch {}
                }}
                className="rounded border-zinc-300 dark:border-zinc-600 text-amber-500 focus:ring-amber-300 h-3.5 w-3.5"
              />
              Auto-queue 80+ Easy Apply
            </label>

            <div className="ml-auto flex items-center gap-3">
              {/* B2: Sort */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <ListFilter size={12} />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  aria-label="Sort results"
                  className="text-xs px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
                >
                  <option value="newest">Newest</option>
                  <option value="fit">Best Fit</option>
                  <option value="salary">Salary</option>
                  <option value="company">Company</option>
                </select>
              </div>
              <span className="text-xs text-zinc-500">
                {loading ? "Loading…" : `${displayRows.length} result${displayRows.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>

          {/* Results list */}
          {!loading && displayRows.length === 0 && (
            <EmptyState
              icon={SearchX}
              title="No search results yet"
              description={
                allRows.length === 0
                  ? "The CLI runs daily; check back tomorrow, or run python -m cli search run-profiles on the workstation."
                  : "No results match the current filters. Try widening filters or switching status."
              }
            />
          )}

          {displayRows.length > 0 && (
            <div className="space-y-2">
              {displayRows.map((row) => (
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

      {/* Modals */}
      {tailorRow && (
        <TailorModal
          application={{ title: tailorRow.title ?? "", company: tailorRow.company ?? "", url: tailorRow.url, tailored_resume: tailoredResumesRef.current.get(tailorRow.id) ?? null }}
          open={tailorOpen}
          onOpenChange={(open) => { setTailorOpen(open); if (!open) { setTailorRow(null); setTailorApplicationId(null) } }}
          onSave={handleTailorSave}
        />
      )}

      {coverLetterRow && (
        <CoverLetterModal
          application={{ title: coverLetterRow.title ?? "", company: coverLetterRow.company ?? "", url: coverLetterRow.url }}
          open={coverLetterOpen}
          onOpenChange={(open) => { setCoverLetterOpen(open); if (!open) setCoverLetterRow(null) }}
          onSave={handleCoverLetterSave}
        />
      )}

      {applyRow && (
        <ApplyFlow
          job={rowToJob(applyRow)}
          isOpen={applyOpen}
          onClose={() => { setApplyOpen(false); setApplyRow(null) }}
          onApplied={handleApplied}
          tailoredResume={tailoredResumesRef.current.get(applyRow.id) ?? null}
          coverLetter={coverLettersRef.current.get(applyRow.id) ?? null}
        />
      )}
    </div>
  )
}
