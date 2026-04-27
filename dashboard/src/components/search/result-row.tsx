"use client"

import { useMemo } from "react"
import { JobCard } from "@/components/shared/job-card"
import { rowToJob } from "@/lib/search-results/to-job"
import type { JobSearchResultRow } from "@/types/supabase"
import type { FitScore } from "@/types"

interface ResultRowProps {
  row: JobSearchResultRow
  selected: boolean
  onSelect: (row: JobSearchResultRow) => void
  onTrack: (row: JobSearchResultRow) => void
  onApply?: (row: JobSearchResultRow) => void
  onTailor?: (row: JobSearchResultRow) => void
  onCoverLetter?: (row: JobSearchResultRow) => void
  onTrackAndTailor?: (row: JobSearchResultRow) => void
  onAddToQueue?: (row: JobSearchResultRow) => void
  isInQueue?: (row: JobSearchResultRow) => boolean
  fitScore?: FitScore
}

export function ResultRow({
  row,
  selected,
  onSelect,
  onTrack,
  onApply,
  onTailor,
  onCoverLetter,
  onTrackAndTailor,
  onAddToQueue,
  isInQueue,
  fitScore,
}: ResultRowProps) {
  const job = useMemo(() => rowToJob(row), [row])

  return (
    <div
      className={`rounded-xl transition-all ${
        selected ? "ring-2 ring-amber-400 ring-offset-1" : ""
      }`}
    >
      <JobCard
        job={job}
        onTrack={() => onTrack(row)}
        onApply={onApply ? () => onApply(row) : undefined}
        onTailor={onTailor ? () => onTailor(row) : undefined}
        onCoverLetter={onCoverLetter ? () => onCoverLetter(row) : undefined}
        onTrackAndTailor={onTrackAndTailor ? () => onTrackAndTailor(row) : undefined}
        onViewDetails={() => onSelect(row)}
        onAddToQueue={onAddToQueue ? () => onAddToQueue(row) : undefined}
        tracked={!!row.application_id}
        isNew={row.status === "new"}
        fitScore={fitScore}
        inQueue={isInQueue ? isInQueue(row) : false}
      />
    </div>
  )
}
