"use client"

import { useState, useRef, useEffect, useId } from "react"
import { ChevronDown, ChevronUp, Plus } from "lucide-react"
import type { Application, ApplicationStatus } from "@/types"
import { STATUSES } from "@/lib/constants"
import {
  findApplicationByUrl,
  formatDuplicateConfirmMessage,
} from "@/lib/url-dedup"

interface AddFormProps {
  onAdd: (
    job: Partial<Application>,
    entryPoint: "manual"
  ) => Promise<{ data: unknown; error: unknown }>
  /**
   * CAR-167: current user's applications, passed so the form can warn
   * before adding a duplicate URL. Matches CLI `tracker add` behavior.
   */
  existingApplications?: Application[]
}

export function AddForm({ onAdd, existingApplications = [] }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [company, setCompany] = useState("")
  const [location, setLocation] = useState("")
  const [url, setUrl] = useState("")
  const [source, setSource] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [status, setStatus] = useState<ApplicationStatus | undefined>(undefined)
  const [notes, setNotes] = useState("")
  const [jobDescription, setJobDescription] = useState("")

  const detailsId = useId()
  const statusId = useId()
  const notesId = useId()
  const jobDescId = useId()
  const statusSelectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (detailsOpen) {
      statusSelectRef.current?.focus()
    }
  }, [detailsOpen])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !company.trim()) return

    // CAR-167: block on duplicate URL unless the user confirms. Parity
    // with ApplicationTracker.find_by_url in the CLI (src/jobs/tracker.py).
    const trimmedUrl = url.trim()
    if (trimmedUrl) {
      const existing = findApplicationByUrl(trimmedUrl, existingApplications)
      if (existing) {
        const proceed = window.confirm(formatDuplicateConfirmMessage(existing))
        if (!proceed) return
      }
    }

    setSubmitting(true)
    const result = await onAdd(
      {
        title: title.trim(),
        company: company.trim(),
        location: location.trim() || null,
        url: trimmedUrl || null,
        source: source.trim() || null,
        status,
        notes,
        job_description: jobDescription || null,
      },
      "manual"
    )
    setSubmitting(false)

    if (result.error == null) {
      setTitle("")
      setCompany("")
      setLocation("")
      setUrl("")
      setSource("")
      setStatus(undefined)
      setNotes("")
      setJobDescription("")
      setDetailsOpen(false)
      setOpen(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-amber-500" />
          Add Application Manually
        </div>
        {open ? (
          <ChevronUp size={14} className="text-zinc-400" />
        ) : (
          <ChevronDown size={14} className="text-zinc-400" />
        )}
      </button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="px-4 pb-4 space-y-3 border-t border-zinc-100"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div>
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                Job Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Systems Engineer"
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
                required
                placeholder="Acme Corp"
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Indianapolis, IN"
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                Source
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Indeed, Dice, LinkedIn..."
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 transition-colors py-1"
            >
              More details
              {detailsOpen ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
            </button>
            {detailsOpen && (
              <div id={detailsId} className="space-y-3 mt-2">
                <div>
                  <label htmlFor={statusId} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Status
                  </label>
                  <select
                    id={statusId}
                    ref={statusSelectRef}
                    value={status ?? "interested"}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setStatus(e.target.value as ApplicationStatus)
                    }
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                  >
                    {STATUSES.slice(0, 6).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={notesId} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Notes
                  </label>
                  <textarea
                    id={notesId}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Private notes about this role..."
                    rows={3}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label htmlFor={jobDescId} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                    Job Description
                  </label>
                  <textarea
                    id={jobDescId}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the job description here..."
                    rows={8}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!title.trim() || !company.trim() || submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Plus size={14} />
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
