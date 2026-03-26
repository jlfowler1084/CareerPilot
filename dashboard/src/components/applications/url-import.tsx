"use client"

import { useState } from "react"
import { Link2, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { TailorModal } from "@/components/applications/tailor-modal"
import type { ExtractedJob, Application } from "@/types"

interface UrlImportProps {
  onSave: (extracted: ExtractedJob, url: string) => Promise<{ data: Application | null; error: unknown }>
  onUpdate: (id: string, updates: Partial<Application>) => Promise<unknown>
}

const SOURCE_OPTIONS = [
  "Indeed",
  "Dice",
  "LinkedIn",
  "Glassdoor",
  "ZipRecruiter",
  "USAJobs",
  "Government",
  "Company Site",
]

export function UrlImport({ onSave, onUpdate }: UrlImportProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedJob | null>(null)
  const [detectedSource, setDetectedSource] = useState("")
  const [domain, setDomain] = useState("")
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [title, setTitle] = useState("")
  const [company, setCompany] = useState("")
  const [location, setLocation] = useState("")
  const [salaryRange, setSalaryRange] = useState("")
  const [jobType, setJobType] = useState("")
  const [source, setSource] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")

  // Tailor modal state
  const [tailorOpen, setTailorOpen] = useState(false)
  const [savedApp, setSavedApp] = useState<Application | null>(null)

  function getDomain(inputUrl: string): string {
    try {
      return new URL(inputUrl).hostname.replace("www.", "")
    } catch {
      return ""
    }
  }

  async function handleExtract() {
    const trimmed = url.trim()
    if (!trimmed) return

    setLoading(true)
    setExtracted(null)

    try {
      const res = await fetch("/api/extract-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        toast.error(json.error || "Extraction failed")
        setLoading(false)
        return
      }

      const data: ExtractedJob = json.data
      setExtracted(data)
      setDetectedSource(json.source)
      setDomain(getDomain(trimmed))

      // Populate editable fields
      setTitle(data.title || "")
      setCompany(data.company || "")
      setLocation(data.location || "")
      setSalaryRange(data.salary_range || "")
      setJobType(data.job_type || "")
      setSource(json.source || "")
      setJobDescription(data.job_description || "")
      setContactName(data.contact_name || "")
      setContactEmail(data.contact_email || "")
    } catch {
      toast.error("Failed to connect to extraction service")
    } finally {
      setLoading(false)
    }
  }

  function buildExtractedJob(): ExtractedJob {
    return {
      title,
      company,
      location: location || null,
      salary_range: salaryRange || null,
      job_type: jobType || null,
      job_description: jobDescription || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      posted_date: extracted?.posted_date || null,
      source,
      key_requirements: extracted?.key_requirements || [],
      nice_to_haves: extracted?.nice_to_haves || [],
      fit_analysis: extracted?.fit_analysis || null,
    }
  }

  async function handleSave(openTailor = false) {
    if (!title.trim() || !company.trim()) {
      toast.error("Title and company are required")
      return
    }

    setSaving(true)
    const { data, error } = await onSave(buildExtractedJob(), url.trim())
    setSaving(false)

    if (error || !data) {
      toast.error("Failed to save application")
      return
    }

    toast.success(`Saved: ${data.title} at ${data.company}`)

    if (openTailor) {
      setSavedApp(data)
      setTailorOpen(true)
    } else {
      resetForm()
    }
  }

  function resetForm() {
    setUrl("")
    setExtracted(null)
    setTitle("")
    setCompany("")
    setLocation("")
    setSalaryRange("")
    setJobType("")
    setSource("")
    setJobDescription("")
    setContactName("")
    setContactEmail("")
    setSavedApp(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleExtract()
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {/* URL Input */}
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Link2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste job URL..."
                disabled={loading}
                className="w-full text-sm border border-zinc-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleExtract}
              disabled={!url.trim() || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Extracting...
                </>
              ) : (
                "Extract"
              )}
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="px-4 pb-4 border-t border-zinc-100 pt-4">
            <p className="text-xs text-zinc-500 mb-3">
              Extracting job details from{" "}
              <span className="font-medium">{getDomain(url.trim())}</span>...
            </p>
            <div className="space-y-3 animate-pulse">
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 bg-zinc-100 rounded-lg" />
                <div className="h-10 bg-zinc-100 rounded-lg" />
              </div>
              <div className="h-10 bg-zinc-100 rounded-lg" />
              <div className="h-24 bg-zinc-100 rounded-lg" />
            </div>
          </div>
        )}

        {/* Preview / Edit form */}
        {extracted && !loading && (
          <div className="border-t border-zinc-100">
            {/* Fit Analysis highlight */}
            {extracted.fit_analysis && (
              <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  Fit Analysis
                </p>
                <p className="text-xs text-amber-900 leading-relaxed">
                  {extracted.fit_analysis}
                </p>
              </div>
            )}

            <div className="p-4 space-y-3">
              {/* Row 1: Title + Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Company *
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              </div>

              {/* Row 2: Location + Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Source
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                  >
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Salary + Job Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Salary Range
                  </label>
                  <input
                    type="text"
                    value={salaryRange}
                    onChange={(e) => setSalaryRange(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Job Type
                  </label>
                  <input
                    type="text"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              </div>

              {/* Row 4: Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              </div>

              {/* Job Description */}
              <div>
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                  Job Description
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="w-full text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
              </div>

              {/* Key Requirements */}
              {extracted.key_requirements.length > 0 && (
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
                    Key Requirements
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {extracted.key_requirements.map((req, i) => (
                      <span
                        key={i}
                        className="inline-block text-[10px] px-2 py-1 bg-zinc-100 text-zinc-700 rounded-full"
                      >
                        {req}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Nice to Haves */}
              {extracted.nice_to_haves.length > 0 && (
                <div>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
                    Nice to Have
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {extracted.nice_to_haves.map((item, i) => (
                      <span
                        key={i}
                        className="inline-block text-[10px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving || !title.trim() || !company.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null}
                  Save to Applications
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || !title.trim() || !company.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-amber-700 text-sm font-semibold border border-amber-300 hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save + Tailor Resume
                </button>
                <button
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors ml-auto"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tailor Modal (for Save + Tailor flow) */}
      {savedApp && (
        <TailorModal
          application={savedApp}
          open={tailorOpen}
          onOpenChange={(open) => {
            setTailorOpen(open)
            if (!open) resetForm()
          }}
          onSave={async (tailoredResume) => {
            await onUpdate(savedApp.id, { tailored_resume: tailoredResume })
            resetForm()
          }}
        />
      )}
    </>
  )
}
