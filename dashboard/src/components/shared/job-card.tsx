import { Plus, Sparkles, FileText, Send, Zap, ListPlus } from "lucide-react"
import { FitScoreBadge } from "@/components/search/fit-score-badge"
import type { Job, FitScore } from "@/types"

interface JobCardProps {
  job: Job
  onTrack: (job: Job) => void
  onApply?: (job: Job) => void
  onTailor?: (job: Job) => void
  onCoverLetter?: (job: Job) => void
  onTrackAndTailor?: (job: Job) => void
  onViewDetails?: (job: Job) => void
  onAddToQueue?: (job: Job) => void
  tracked: boolean
  isNew?: boolean
  fitScore?: FitScore
  inQueue?: boolean
}

export function JobCard({ job, onTrack, onApply, onTailor, onCoverLetter, onTrackAndTailor, onViewDetails, onAddToQueue, tracked, isNew, fitScore, inQueue }: JobCardProps) {
  const sourceColor = job.source === "Indeed" ? "#2557a7" : "#0c7ff2"

  return (
    <div
      className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-md transition-all hover:-translate-y-px group cursor-pointer"
      style={{ borderLeft: `4px solid ${sourceColor}` }}
      onClick={() => onViewDetails?.(job)}
      {...(onViewDetails ? { role: "button", tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onViewDetails(job)
        }
      }} : {})}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm text-zinc-900 leading-tight group-hover:text-blue-700 transition-colors">
              {job.title}
            </span>
            {fitScore && <FitScoreBadge score={fitScore} />}
            {isNew && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                NEW
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mb-2">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
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
            {job.easyApply && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-50 text-green-700">
                Easy Apply
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <span
            className="text-[10px] font-bold font-mono px-2 py-0.5 rounded text-white"
            style={{ background: sourceColor }}
          >
            {job.source}
          </span>
          {job.posted && (
            <span className="text-[10px] text-zinc-400 font-mono">{job.posted}</span>
          )}
          {!tracked ? (
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={() => onTrack(job)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1"
              >
                <Plus size={10} /> Track
              </button>
              {onAddToQueue && !inQueue && (
                <button
                  type="button"
                  onClick={() => onAddToQueue(job)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    fitScore && fitScore.total >= 60 && job.easyApply
                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                      : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100 border border-zinc-200"
                  }`}
                  title="Add to auto-apply queue"
                >
                  <ListPlus size={10} /> Queue
                </button>
              )}
              {inQueue && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-1">
                  <ListPlus size={10} /> Queued
                </span>
              )}
              {job.url && onApply && (
                <button
                  type="button"
                  onClick={() => onApply(job)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    job.easyApply
                      ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  }`}
                  title="Start apply flow"
                >
                  {job.easyApply ? <Zap size={10} /> : <Send size={10} />}
                  Apply
                </button>
              )}
              {job.url && onTailor && (
                <button
                  onClick={() => onTailor(job)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md text-zinc-400 hover:text-amber-600 transition-colors flex items-center gap-1"
                  title="Tailor resume for this job"
                >
                  <Sparkles size={10} /> Tailor
                </button>
              )}
              {job.url && onCoverLetter && (
                <button
                  onClick={() => onCoverLetter(job)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md text-zinc-400 hover:text-blue-600 transition-colors flex items-center gap-1"
                  title="Generate cover letter for this job"
                >
                  <FileText size={10} /> Cover Letter
                </button>
              )}
              {job.url && onTrackAndTailor && (
                <button
                  onClick={() => onTrackAndTailor(job)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors flex items-center gap-1"
                  title="Track this job and tailor resume"
                >
                  <Plus size={10} />
                  <Sparkles size={10} />
                  Track + Tailor
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Tracking
              </span>
              {job.url && onApply && (
                <button
                  type="button"
                  onClick={() => onApply(job)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    job.easyApply
                      ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  }`}
                  title="Start apply flow"
                >
                  {job.easyApply ? <Zap size={10} /> : <Send size={10} />}
                  Apply
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
