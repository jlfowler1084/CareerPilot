"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Briefcase } from "lucide-react"
import { useApplications } from "@/hooks/use-applications"
import { buildApplicationInput } from "@/lib/search-results/track-input"
import type { JobSearchResultRow, JobSearchResultUpdate } from "@/types/supabase"

interface TrackButtonProps {
  row: JobSearchResultRow
  onUpdateRow: (id: string, updates: JobSearchResultUpdate) => Promise<{ error: unknown }>
}

function navigateToResearch(router: ReturnType<typeof useRouter>, applicationId: string) {
  router.push(`/applications?focus=${applicationId}&tab=research`)
}

export function TrackButton({ row, onUpdateRow }: TrackButtonProps) {
  const router = useRouter()
  const { addApplication } = useApplications()
  const [busy, setBusy] = useState(false)

  // Already tracked: dedup via the application_id FK column. The CLI pipeline
  // sets this when re-discovering a row that maps to a known application; the
  // dashboard sets it when the user clicks Track. Either way, navigate — no
  // duplicate insert.
  if (row.application_id) {
    return (
      <button
        type="button"
        onClick={() => navigateToResearch(router, row.application_id as string)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-sm font-semibold transition-colors"
      >
        <Briefcase size={14} />
        Tracked — open
      </button>
    )
  }

  async function handleTrack() {
    if (busy) return
    setBusy(true)
    try {
      const result = await addApplication(buildApplicationInput(row), "search")
      const newId = result?.data?.id
      if (!newId) return // toast already surfaced by addApplication on error
      // Stamp the search-result row with the new application_id and flip status.
      // If this fails, the application still exists; user can navigate manually.
      await onUpdateRow(row.id, { status: "tracked", application_id: newId })
      navigateToResearch(router, newId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleTrack}
      disabled={busy}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 bg-white hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-semibold transition-colors disabled:opacity-50"
    >
      <Briefcase size={14} />
      {busy ? "Tracking…" : "Track"}
    </button>
  )
}

