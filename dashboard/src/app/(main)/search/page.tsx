"use client"

import { useState } from "react"
import { useSearch } from "@/hooks/use-search"
import { useApplications } from "@/hooks/use-applications"
import { ProfileChips } from "@/components/search/profile-chips"
import { SearchControls } from "@/components/search/search-controls"
import { JobCard } from "@/components/shared/job-card"
import { TailorModal } from "@/components/applications/tailor-modal"
import { AlertCircle } from "lucide-react"
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
  } = useSearch()

  const { applications, addApplication, updateApplication } = useApplications()

  // Track which jobs have been tracked in this session
  const [sessionTracked, setSessionTracked] = useState<Set<string>>(new Set())

  // Tailor modal state
  const [tailorJob, setTailorJob] = useState<Job | null>(null)
  const [tailorOpen, setTailorOpen] = useState(false)
  const [trackedAppId, setTrackedAppId] = useState<string | null>(null)

  function isTracked(job: Job): boolean {
    const key = `${job.title}|||${job.company}`.toLowerCase()
    if (sessionTracked.has(key)) return true
    return applications.some(
      (a) =>
        a.title.toLowerCase() === job.title.toLowerCase() &&
        a.company.toLowerCase() === job.company.toLowerCase()
    )
  }

  async function handleTrack(job: Job) {
    const key = `${job.title}|||${job.company}`.toLowerCase()
    setSessionTracked((prev) => new Set(prev).add(key))
    await addApplication(job, "search")
  }

  function handleTailor(job: Job) {
    setTailorJob(job)
    setTrackedAppId(null)
    setTailorOpen(true)
  }

  async function handleTrackAndTailor(job: Job) {
    const key = `${job.title}|||${job.company}`.toLowerCase()
    setSessionTracked((prev) => new Set(prev).add(key))
    const result = await addApplication(job, "search")
    setTailorJob(job)
    setTrackedAppId(result?.data?.id ?? null)
    setTailorOpen(true)
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
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Results
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {searchResults.map((job, index) => (
              <JobCard
                key={`${job.title}-${job.company}-${index}`}
                job={job}
                onTrack={handleTrack}
                onTailor={handleTailor}
                onTrackAndTailor={handleTrackAndTailor}
                tracked={isTracked(job)}
                isNew={isNew(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {searchComplete && searchResults.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-500">
            No results found. Try selecting different profiles.
          </p>
        </div>
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
            }
            // If no tracked app (just Tailor without Track), copy is still available
          }}
        />
      )}
    </div>
  )
}
