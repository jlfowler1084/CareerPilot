"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useSearch } from "@/hooks/use-search"
import { useSearchHistory } from "@/hooks/use-search-history"
import { useSearchProfiles } from "@/hooks/use-search-profiles"
import { useApplications } from "@/hooks/use-applications"
import { ProfileChips } from "@/components/search/profile-chips"
import { CustomSearchBar } from "@/components/search/custom-search-bar"
import { SearchControls } from "@/components/search/search-controls"
import { SearchHistory } from "@/components/search/search-history"
import { SearchFiltersBar, DEFAULT_FILTERS, type SearchFilters } from "@/components/search/search-filters"
import { applyFilters, hasActiveFilters } from "@/lib/search-filter-utils"
import { JobCard } from "@/components/shared/job-card"
import { TailorModal } from "@/components/applications/tailor-modal"
import { CoverLetterModal } from "@/components/applications/cover-letter-modal"
import { JobDetailPane } from "@/components/search/job-detail-pane"
import { ApplyFlow } from "@/components/search/apply-flow"
import { EmptyState } from "@/components/shared/empty-state"
import { logActivity } from "@/hooks/use-activity-log"
import { AlertCircle, SearchX, Clock, CheckCircle2, Info, X } from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"
import type { Job } from "@/types"

const HIDDEN_PROFILES_KEY = "careerpilot_hidden_profiles"
const SELECTED_PROFILES_KEY = "careerpilot_selected_profiles"

function loadHiddenProfiles(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_PROFILES_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveHiddenProfiles(ids: Set<string>) {
  localStorage.setItem(HIDDEN_PROFILES_KEY, JSON.stringify([...ids]))
}

function loadSelectedProfiles(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SELECTED_PROFILES_KEY)
    return raw ? new Set(JSON.parse(raw)) : null
  } catch { return null }
}

function saveSelectedProfiles(ids: Set<string>) {
  localStorage.setItem(SELECTED_PROFILES_KEY, JSON.stringify([...ids]))
}

export default function SearchPage() {
  const history = useSearchHistory()
  const {
    profiles: supabaseProfiles,
    loading: profilesLoading,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useSearchProfiles()

  // Hidden profiles (default profiles hidden via localStorage)
  const [hiddenProfiles, setHiddenProfiles] = useState<Set<string>>(() => loadHiddenProfiles())

  // Convert Supabase profiles to the format use-search expects
  const searchProfileInputs = useMemo(
    () => supabaseProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      keyword: p.keyword,
      location: p.location,
      source: p.source,
      icon: p.icon,
    })),
    [supabaseProfiles]
  )

  const {
    searchResults,
    setSearchResults,
    selectedProfiles,
    toggleProfile,
    selectAll,
    selectNone,
    runSearch,
    stopSearch,
    loading,
    progress,
    searchComplete,
    errors,
    indeedInfo,
    isNew,
    lastSearchTime,
  } = useSearch({
    profiles: searchProfileInputs,
    onRunCreated: (runId) => {
      history.loadHistory()
      history.setActiveRunId(runId)
      setViewingHistorical(false)
      setSavedToHistory(true)
      setFilters(DEFAULT_FILTERS)
    },
  })

  // Persist selected profiles to localStorage
  useEffect(() => {
    if (selectedProfiles.size > 0) {
      saveSelectedProfiles(selectedProfiles)
    }
  }, [selectedProfiles])

  // Restore selected profiles from localStorage on mount
  const selectionRestored = useRef(false)
  useEffect(() => {
    if (selectionRestored.current || profilesLoading) return
    selectionRestored.current = true
    const saved = loadSelectedProfiles()
    if (saved && saved.size > 0) {
      // Only restore IDs that still exist in current profiles
      const validIds = new Set(supabaseProfiles.map((p) => p.id))
      for (const id of saved) {
        if (validIds.has(id) && !selectedProfiles.has(id)) {
          toggleProfile(id)
        }
      }
    }
  }, [profilesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const { applications, addApplication, updateApplication } = useApplications()

  // Track whether user is viewing a manually-selected historical run
  const [viewingHistorical, setViewingHistorical] = useState(false)
  const [savedToHistory, setSavedToHistory] = useState(false)

  // The active run object (for the banner date display)
  const activeRun = history.runs.find((r) => r.id === history.activeRunId)

  function formatBannerDate(dateStr: string): string {
    const d = new Date(dateStr)
    const time = format(d, "h:mm a")
    if (isToday(d)) return `Today ${time}`
    if (isYesterday(d)) return `Yesterday ${time}`
    return format(d, "MMM d") + ` ${time}`
  }

  const handleSelectRun = useCallback(
    async (runId: string) => {
      history.setActiveRunId(runId)
      setViewingHistorical(true)
      setSavedToHistory(false)
      const results = await history.loadRunResults(runId)
      setSearchResults(results)
    },
    [history, setSearchResults]
  )

  const handleDeleteRun = useCallback(
    async (runId: string) => {
      const wasActive = history.activeRunId === runId
      await history.deleteRun(runId)
      if (wasActive && history.runs.length > 1) {
        const remaining = history.runs.filter((r) => r.id !== runId)
        if (remaining.length > 0) {
          await handleSelectRun(remaining[0].id)
        }
      }
    },
    [history, handleSelectRun]
  )

  const handleClearAll = useCallback(async () => {
    await history.clearAll()
    setSearchResults([])
  }, [history, setSearchResults])

  // On mount: once history loads with an active run, restore its results
  const initialLoadDone = useRef(false)
  useEffect(() => {
    if (initialLoadDone.current) return
    if (history.loading) return
    if (!history.activeRunId) return

    initialLoadDone.current = true
    history.loadRunResults(history.activeRunId).then((results) => {
      if (results.length > 0) {
        setSearchResults(results)
      }
    })
  }, [history.loading, history.activeRunId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Indeed info banner dismissed state (resets each search)
  const [infoDismissed, setInfoDismissed] = useState(false)
  useEffect(() => { setInfoDismissed(false) }, [indeedInfo])

  // Search filters (client-side, persists across history navigation)
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const filteredResults = useMemo(
    () => applyFilters(searchResults, filters),
    [searchResults, filters]
  )

  // Sort state
  const [sortBy, setSortBy] = useState<"newest" | "salary" | "company">("newest")

  // Track which jobs have been tracked in this session
  const [sessionTracked, setSessionTracked] = useState<Set<string>>(new Set())

  // Tailor modal state
  const [tailorJob, setTailorJob] = useState<Job | null>(null)
  const [tailorOpen, setTailorOpen] = useState(false)
  const [trackedAppId, setTrackedAppId] = useState<string | null>(null)

  // Cover letter modal state
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null)

  // Job detail pane state
  const [detailJob, setDetailJob] = useState<Job | null>(null)

  // Apply flow state
  const [applyJob, setApplyJob] = useState<Job | null>(null)

  // Pre-generated content maps (Tailor/CoverLetter → Track flow)
  const tailoredResumesRef = useRef<Map<string, string>>(new Map())
  const coverLettersRef = useRef<Map<string, string>>(new Map())

  function jobKey(job: { title: string; company: string }) {
    return `${job.title}|||${job.company}`.toLowerCase()
  }

  function isTracked(job: Job): boolean {
    const key = jobKey(job)
    if (sessionTracked.has(key)) return true
    return applications.some(
      (a) =>
        a.title.toLowerCase() === job.title.toLowerCase() &&
        a.company.toLowerCase() === job.company.toLowerCase()
    )
  }

  async function handleTrack(job: Job) {
    const key = jobKey(job)
    setSessionTracked((prev) => new Set(prev).add(key))
    const result = await addApplication(job, "search")
    // Attach pre-generated content if user tailored/wrote cover letter before tracking
    if (result?.data?.id) {
      const savedResume = tailoredResumesRef.current.get(key)
      const savedLetter = coverLettersRef.current.get(key)
      if (savedResume || savedLetter) {
        await updateApplication(result.data.id, {
          ...(savedResume ? { tailored_resume: savedResume } : {}),
          ...(savedLetter ? { cover_letter: savedLetter } : {}),
        })
        tailoredResumesRef.current.delete(key)
        coverLettersRef.current.delete(key)
      }
    }
  }

  function handleTailor(job: Job) {
    setTailorJob(job)
    setTrackedAppId(null)
    setTailorOpen(true)
  }

  async function handleTrackAndTailor(job: Job) {
    const key = jobKey(job)
    setSessionTracked((prev) => new Set(prev).add(key))
    const result = await addApplication(job, "search")
    setTailorJob(job)
    setTrackedAppId(result?.data?.id ?? null)
    setTailorOpen(true)
  }

  function handleApply(job: Job) {
    setApplyJob(job)
  }

  async function handleApplied(job: Job) {
    const key = jobKey(job)
    const existing = applications.find(
      (a) =>
        a.title.toLowerCase() === job.title.toLowerCase() &&
        a.company.toLowerCase() === job.company.toLowerCase()
    )

    if (existing) {
      // Update status to "applied" — useApplications auto-sets date_applied
      await updateApplication(existing.id, { status: "applied" })
    } else {
      // Track + apply in one step, consolidate writes
      setSessionTracked((prev) => new Set(prev).add(key))
      const savedResume = tailoredResumesRef.current.get(key)
      const savedLetter = coverLettersRef.current.get(key)
      const result = await addApplication(job, "search")
      if (result?.data?.id) {
        // Single update: status + any pre-generated content
        await updateApplication(result.data.id, {
          status: "applied",
          ...(savedResume ? { tailored_resume: savedResume } : {}),
          ...(savedLetter ? { cover_letter: savedLetter } : {}),
        })
        if (savedResume) tailoredResumesRef.current.delete(key)
        if (savedLetter) coverLettersRef.current.delete(key)
      }
    }

    await logActivity(`Applied to ${job.title} at ${job.company}`)
    setApplyJob(null)
  }

  function getJobContent(job: Job): { tailoredResume: string | null; coverLetter: string | null } {
    const key = jobKey(job)
    // Check in-memory refs first (pre-track stashed content)
    const refResume = tailoredResumesRef.current.get(key) ?? null
    const refLetter = coverLettersRef.current.get(key) ?? null

    // Then check tracked application record
    const app = applications.find(
      (a) =>
        a.title.toLowerCase() === job.title.toLowerCase() &&
        a.company.toLowerCase() === job.company.toLowerCase()
    )

    return {
      tailoredResume: refResume || app?.tailored_resume || null,
      coverLetter: refLetter || app?.cover_letter || null,
    }
  }

  // Custom search handler: creates a temporary profile and runs it
  function handleQuickSearch(keyword: string, location: string, source: string) {
    const tempId = `custom_${Date.now()}`
    const tempProfile = {
      id: tempId,
      name: keyword,
      keyword,
      location,
      source,
      icon: "\uD83D\uDD0D",
    }
    // Add temp profile to selected set and trigger search
    // We add it directly to searchProfileInputs by creating a temporary entry
    toggleProfile(tempId)
    // Run search with this single custom profile via the API directly
    const callSearch = async () => {
      const profiles = [tempProfile]
      const allJobs: Job[] = []
      for (const p of profiles) {
        const callIndeed = p.source === "both" || p.source === "indeed"
        const callDice = p.source === "both" || p.source === "dice" || p.source === "dice_contract"
        const contractOnly = p.source === "dice_contract"

        if (callIndeed) {
          try {
            const res = await fetch("/api/search-indeed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keyword: p.keyword, location: p.location }),
            })
            const data = await res.json()
            if (data.jobs && Array.isArray(data.jobs)) {
              allJobs.push(...data.jobs.map((j: Job) => ({ ...j, source: "Indeed" as const, profileId: p.id, profileLabel: p.name })))
            }
          } catch { /* ignore */ }
        }
        if (callDice) {
          try {
            const res = await fetch("/api/search-dice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keyword: p.keyword, location: p.location, contractOnly }),
            })
            const data = await res.json()
            if (data.jobs && Array.isArray(data.jobs)) {
              allJobs.push(...data.jobs.map((j: Job) => ({ ...j, source: "Dice" as const, profileId: p.id, profileLabel: p.name })))
            }
          } catch { /* ignore */ }
        }
      }
      // Merge with existing results
      setSearchResults((prev) => {
        const existing = new Set(prev.map((j) => `${j.title}|||${j.company}`.toLowerCase()))
        const newJobs = allJobs.filter((j) => !existing.has(`${j.title}|||${j.company}`.toLowerCase()))
        return [...newJobs, ...prev]
      })
    }
    callSearch()
  }

  function handleSaveProfile(profile: {
    name: string
    keyword: string
    location: string
    source: "dice" | "indeed" | "both" | "dice_contract"
    icon: string
  }) {
    createProfile(profile)
  }

  function handleHideProfile(id: string) {
    if (id === "__show_all__") {
      setHiddenProfiles(new Set())
      saveHiddenProfiles(new Set())
      return
    }
    setHiddenProfiles((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveHiddenProfiles(next)
      return next
    })
  }

  function handleDuplicateProfile(profile: (typeof supabaseProfiles)[number]) {
    createProfile({
      name: `${profile.name} (Copy)`,
      keyword: profile.keyword,
      location: profile.location,
      source: profile.source,
      icon: profile.icon,
    })
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold">Job Search</h2>

      {/* Custom Search Bar */}
      <CustomSearchBar
        onQuickSearch={handleQuickSearch}
        onSaveProfile={handleSaveProfile}
        disabled={loading}
      />

      {/* Profile Chips */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
        <ProfileChips
          profiles={supabaseProfiles}
          selectedProfiles={selectedProfiles}
          toggleProfile={toggleProfile}
          selectAll={selectAll}
          selectNone={selectNone}
          disabled={loading}
          onEditProfile={(id, updates) => updateProfile(id, updates)}
          onDeleteProfile={deleteProfile}
          onDuplicateProfile={handleDuplicateProfile}
          onHideProfile={handleHideProfile}
          hiddenProfiles={hiddenProfiles}
        />
      </div>

      {/* Search Controls */}
      <SearchControls
        onRun={runSearch}
        onStop={stopSearch}
        loading={loading}
        progress={progress}
        searchComplete={searchComplete}
        resultCount={searchResults.length}
        disabled={selectedProfiles.size === 0}
      />

      {/* Indeed info banner */}
      {indeedInfo && !infoDismissed && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
          <Info size={14} className="text-amber-500 shrink-0" />
          <span className="text-xs text-amber-700">
            Indeed search unavailable — showing Dice results only
          </span>
          <button
            type="button"
            title="Dismiss"
            onClick={() => setInfoDismissed(true)}
            className="ml-auto text-amber-400 hover:text-amber-600"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-red-500" />
            <span className="text-xs font-semibold text-red-700">
              Some profiles had errors
            </span>
          </div>
          <ul className="space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-xs text-red-600">
                {err.profileId}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search History */}
      <SearchHistory
        runs={history.runs}
        activeRunId={history.activeRunId}
        onSelectRun={handleSelectRun}
        onDeleteRun={handleDeleteRun}
        onClearAll={handleClearAll}
        loading={history.loading}
      />

      {/* Historical run banner */}
      {viewingHistorical && activeRun && !loading && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-zinc-100/80 border border-zinc-200">
          <Clock size={14} className="text-zinc-400 shrink-0" />
          <span className="text-xs text-zinc-600">
            Viewing scan from <span className="font-semibold">{formatBannerDate(activeRun.created_at)}</span>
            {" · "}{activeRun.total_results} jobs
          </span>
          <button
            type="button"
            onClick={() => {
              setViewingHistorical(false)
              if (history.runs.length > 0) {
                handleSelectRun(history.runs[0].id)
                setViewingHistorical(false)
              }
            }}
            className="ml-auto text-[11px] font-semibold px-3 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Back to Latest
          </button>
        </div>
      )}

      {/* Saved to history indicator */}
      {savedToHistory && !loading && searchComplete && (
        <div className="flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 size={13} />
          <span>Saved to history</span>
        </div>
      )}

      {/* Quick Filters */}
      {searchResults.length > 0 && (
        <SearchFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          totalCount={searchResults.length}
          filteredCount={filteredResults.length}
        />
      )}

      {/* Results */}
      {filteredResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {hasActiveFilters(filters)
                ? `${filteredResults.length} of ${searchResults.length} Results`
                : `${searchResults.length} Results`}
            </div>
            <div className="flex items-center gap-3">
              {lastSearchTime && !viewingHistorical && (
                <span className="text-[10px] text-zinc-400">
                  Last search: {lastSearchTime.toLocaleString()}
                </span>
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                title="Sort results"
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300"
              >
                <option value="newest">Newest First</option>
                <option value="salary">Salary (High to Low)</option>
                <option value="company">Company A-Z</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {[...filteredResults].sort((a, b) => {
              if (sortBy === "company") return a.company.localeCompare(b.company)
              if (sortBy === "salary") {
                const extractNum = (s: string) => {
                  const m = s.replace(/,/g, "").match(/\d+/)
                  return m ? parseInt(m[0]) : 0
                }
                return extractNum(b.salary || "0") - extractNum(a.salary || "0")
              }
              return 0 // Keep original order for newest
            }).map((job, index) => (
              <JobCard
                key={`${job.title}-${job.company}-${index}`}
                job={job}
                onTrack={handleTrack}
                onApply={handleApply}
                onTailor={handleTailor}
                onCoverLetter={(j) => setCoverLetterJob(j)}
                onTrackAndTailor={handleTrackAndTailor}
                onViewDetails={setDetailJob}
                tracked={isTracked(job)}
                isNew={isNew(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state: filters hid everything */}
      {searchResults.length > 0 && filteredResults.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="No matching results"
          description="All results are hidden by your filters. Try adjusting or clearing filters above."
        />
      )}

      {/* Empty state: no results at all */}
      {searchComplete && searchResults.length === 0 && !loading && (
        <EmptyState
          icon={SearchX}
          title="No results found"
          description="Try selecting different search profiles or broadening your search criteria."
        />
      )}

      {/* Tailor Modal for search results */}
      {tailorJob && (
        <TailorModal
          application={{
            title: tailorJob.title,
            company: tailorJob.company,
            url: tailorJob.url,
            tailored_resume: null,
          }}
          open={tailorOpen}
          onOpenChange={setTailorOpen}
          onSave={async (tailoredResume) => {
            if (trackedAppId) {
              await updateApplication(trackedAppId, { tailored_resume: tailoredResume })
            } else {
              // Standalone Tailor: stash for when Track is clicked later
              tailoredResumesRef.current.set(jobKey(tailorJob), tailoredResume)
            }
          }}
        />
      )}

      {/* Cover Letter Modal */}
      {coverLetterJob && (
        <CoverLetterModal
          application={{ title: coverLetterJob.title, company: coverLetterJob.company, url: coverLetterJob.url }}
          open={!!coverLetterJob}
          onOpenChange={(open) => !open && setCoverLetterJob(null)}
          onSave={async (letter) => {
            coverLettersRef.current.set(jobKey(coverLetterJob), letter)
            setCoverLetterJob(null)
          }}
        />
      )}

      {/* Job Detail Pane */}
      <JobDetailPane
        job={detailJob}
        open={!!detailJob}
        onClose={() => setDetailJob(null)}
        onTrack={handleTrack}
        onApply={handleApply}
        onTailor={handleTailor}
        onCoverLetter={(j) => setCoverLetterJob(j)}
        tracked={detailJob ? isTracked(detailJob) : false}
      />

      {/* Apply Flow Modal */}
      {applyJob && (() => {
        const content = getJobContent(applyJob)
        return (
          <ApplyFlow
            job={applyJob}
            isOpen={!!applyJob}
            onClose={() => setApplyJob(null)}
            onApplied={handleApplied}
            tailoredResume={content.tailoredResume}
            coverLetter={content.coverLetter}
            onTailor={handleTailor}
            onCoverLetter={(j) => setCoverLetterJob(j)}
          />
        )
      })()}
    </div>
  )
}
