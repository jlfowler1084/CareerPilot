"use client"

import { useState, useRef } from "react"
import { useSearch } from "@/hooks/use-search"
import { useApplications } from "@/hooks/use-applications"
import { ProfileChips } from "@/components/search/profile-chips"
import { SearchControls } from "@/components/search/search-controls"
import { JobCard } from "@/components/shared/job-card"
import { TailorModal } from "@/components/applications/tailor-modal"
import { CoverLetterModal } from "@/components/applications/cover-letter-modal"
import { JobDetailPane } from "@/components/search/job-detail-pane"
import { ApplyFlow } from "@/components/search/apply-flow"
import { EmptyState } from "@/components/shared/empty-state"
import { logActivity } from "@/hooks/use-activity-log"
import { AlertCircle, SearchX } from "lucide-react"
import type { Job } from "@/types"

export default function SearchPage() {
  const {
    searchResults,
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
    isNew,
    lastSearchTime,
  } = useSearch()

  const { applications, addApplication, updateApplication } = useApplications()

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

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold">Job Search</h2>

      {/* Profile Chips */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <ProfileChips
          selectedProfiles={selectedProfiles}
          toggleProfile={toggleProfile}
          selectAll={selectAll}
          selectNone={selectNone}
          disabled={loading}
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

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {searchResults.length} Results
            </div>
            <div className="flex items-center gap-3">
              {lastSearchTime && (
                <span className="text-[10px] text-zinc-400">
                  Last search: {lastSearchTime.toLocaleString()}
                </span>
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300"
              >
                <option value="newest">Newest First</option>
                <option value="salary">Salary (High to Low)</option>
                <option value="company">Company A-Z</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {[...searchResults].sort((a, b) => {
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

      {/* Empty state */}
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
