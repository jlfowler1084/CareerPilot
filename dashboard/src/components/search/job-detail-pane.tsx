"use client"

import { useEffect } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { useJobDetails } from "@/hooks/use-job-details"
import {
  ExternalLink,
  Plus,
  Sparkles,
  FileText,
  AlertCircle,
  Send,
  Zap,
} from "lucide-react"
import type { Job } from "@/types"

interface JobDetailPaneProps {
  job: Job | null
  open: boolean
  onClose: () => void
  onTrack: (job: Job) => void
  onApply?: (job: Job) => void
  onTailor?: (job: Job) => void
  onCoverLetter?: (job: Job) => void
  tracked: boolean
}

export function JobDetailPane({
  job,
  open,
  onClose,
  onTrack,
  onApply,
  onTailor,
  onCoverLetter,
  tracked,
}: JobDetailPaneProps) {
  const { details, isLoading, error, fetchDetails, clearDetails } =
    useJobDetails()

  useEffect(() => {
    if (open && job) {
      fetchDetails({
        url: job.url,
        source: job.source,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        type: job.type,
        posted: job.posted,
      })
    }
    if (!open) {
      clearDetails()
    }
  }, [open, job?.url]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null

  const sourceColor = job.source === "Indeed" ? "#2557a7" : "#0c7ff2"

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="md:max-w-[500px] max-w-full">
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <SheetHeader className="p-4 pb-4">
            <div className="flex items-start gap-2 pr-8">
              <SheetTitle className="text-lg leading-snug">
                {job.title}
              </SheetTitle>
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-blue-600 transition-colors flex-shrink-0 mt-0.5"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            <SheetDescription>
              {job.company}
              {job.location ? ` \u00B7 ${job.location}` : ""}
            </SheetDescription>

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span
                className="text-[10px] font-bold font-mono px-2 py-0.5 rounded text-white"
                style={{ background: sourceColor }}
              >
                {job.source}
              </span>
              {job.salary && job.salary !== "Not listed" && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  {job.salary}
                </span>
              )}
              {job.type && job.type !== "N/A" && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {job.type}
                </span>
              )}
              {job.posted && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">
                  {job.posted}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {!tracked ? (
                <button
                  type="button"
                  onClick={() => onTrack(job)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={12} /> Track
                </button>
              ) : (
                <span className="text-xs font-bold px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 10 10"
                    fill="none"
                  >
                    <path
                      d="M2 5l2.5 2.5L8 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Tracking
                </span>
              )}
              {job.url && onTailor && (
                <button
                  type="button"
                  onClick={() => onTailor(job)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md text-zinc-500 hover:text-amber-600 border border-zinc-200 hover:border-amber-200 transition-colors flex items-center gap-1.5"
                >
                  <Sparkles size={12} /> Tailor
                </button>
              )}
              {job.url && onCoverLetter && (
                <button
                  type="button"
                  onClick={() => onCoverLetter(job)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md text-zinc-500 hover:text-blue-600 border border-zinc-200 hover:border-blue-200 transition-colors flex items-center gap-1.5"
                >
                  <FileText size={12} /> Cover Letter
                </button>
              )}
              {job.url && onApply ? (
                <button
                  type="button"
                  onClick={() => onApply(job)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ml-auto ${
                    job.easyApply
                      ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  }`}
                >
                  {job.easyApply ? <Zap size={12} /> : <Send size={12} />}
                  Apply
                </button>
              ) : (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-md text-zinc-500 hover:text-blue-600 border border-zinc-200 hover:border-blue-200 transition-colors flex items-center gap-1.5 ml-auto"
                >
                  <ExternalLink size={12} /> View Original
                </a>
              )}
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="p-4 pt-2">
            {isLoading ? (
              <DetailSkeleton />
            ) : error ? (
              <DetailError job={job} error={error} />
            ) : details ? (
              <DetailContent details={details} job={job} />
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// --- Loading skeleton ---
function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Description skeleton */}
      <div>
        <div className="h-3 w-32 bg-zinc-100 rounded mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-3 bg-zinc-100 rounded"
              style={{ width: `${85 - i * 8}%` }}
            />
          ))}
        </div>
      </div>
      {/* Requirements skeleton */}
      <div>
        <div className="h-3 w-28 bg-zinc-100 rounded mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-100 mt-1.5 flex-shrink-0" />
              <div
                className="h-3 bg-zinc-100 rounded flex-1"
                style={{ width: `${70 + i * 5}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Error state ---
function DetailError({ job, error }: { job: Job; error: string }) {
  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-red-700 mb-1">
            Couldn&apos;t load full description
          </p>
          <p className="text-xs text-red-600">{error}</p>
        </div>
      </div>
      <div className="text-center">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
        >
          <ExternalLink size={12} />
          View Full Posting on {job.source}
        </a>
      </div>
    </div>
  )
}

// --- Full content display ---
function DetailContent({
  details,
  job,
}: {
  details: {
    description: string
    requirements: string[]
    niceToHaves: string[]
    applyUrl: string
    source: string
    cached: boolean
  }
  job: Job
}) {
  const hasDescription = details.description && details.description.trim()
  const isDice = job.source === "Dice"

  return (
    <div className="space-y-5">
      {/* Description */}
      {hasDescription ? (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            About This Role
          </h4>
          <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
            {details.description}
          </div>
        </div>
      ) : isDice ? (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-center">
          <p className="text-xs text-zinc-500 mb-3">
            Full job description is available on Dice.
          </p>
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            <ExternalLink size={12} />
            View Full Posting on Dice
          </a>
        </div>
      ) : null}

      {/* Requirements */}
      {details.requirements.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Requirements
          </h4>
          <ul className="space-y-1.5">
            {details.requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nice to haves */}
      {details.niceToHaves.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Nice to Have
          </h4>
          <ul className="space-y-1.5">
            {details.niceToHaves.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-2 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer source info */}
      <div className="border-t border-zinc-100 pt-4 mt-4">
        <div className="flex items-center justify-between text-[10px] text-zinc-400">
          <span>
            Found via {job.source}
            {job.posted ? ` \u00B7 ${job.posted}` : ""}
          </span>
          {details.cached && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
              cached
            </span>
          )}
        </div>
        {details.applyUrl && details.applyUrl !== job.url && (
          <a
            href={details.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors mt-2"
          >
            <ExternalLink size={12} />
            Apply Directly
          </a>
        )}
      </div>
    </div>
  )
}
