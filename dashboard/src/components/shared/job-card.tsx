import { ExternalLink, Plus, Sparkles } from "lucide-react"
import type { Job } from "@/types"

interface JobCardProps {
  job: Job
  onTrack: (job: Job) => void
  onTailor?: (job: Job) => void
  onTrackAndTailor?: (job: Job) => void
  tracked: boolean
  isNew?: boolean
}

export function JobCard({ job, onTrack, onTailor, onTrackAndTailor, tracked, isNew }: JobCardProps) {
  const sourceColor = job.source === "Indeed" ? "#2557a7" : "#0c7ff2"

  return (
    <div
      className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-md transition-all hover:-translate-y-px group"
      style={{ borderLeft: `4px solid ${sourceColor}` }}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-bold text-sm text-zinc-900 leading-tight group-hover:text-blue-700 transition-colors cursor-pointer"
              onClick={() => job.url && window.open(job.url, "_blank")}
            >
              {job.title}
              <ExternalLink
                size={12}
                className="inline ml-1.5 opacity-0 group-hover:opacity-60 transition-opacity"
              />
            </span>
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
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
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
              {job.url && onTailor && (
                <button
                  onClick={() => onTailor(job)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md text-zinc-400 hover:text-amber-600 transition-colors flex items-center gap-1"
                  title="Tailor resume for this job"
                >
                  <Sparkles size={10} /> Tailor
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
            <span className="text-[10px] font-mono text-zinc-400">
              Tracked
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
