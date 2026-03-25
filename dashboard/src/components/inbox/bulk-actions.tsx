"use client"

import type { Application } from "@/types"

interface BulkActionsProps {
  selectedCount: number
  applications: Pick<Application, "id" | "company" | "title">[]
  onDismiss: () => void
  onLink: (applicationId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function BulkActions({
  selectedCount, applications, onDismiss, onLink, onSelectAll, onDeselectAll,
}: BulkActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800">
      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
        {selectedCount} selected
      </span>
      <button
        onClick={onDismiss}
        className="text-xs px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
      >
        Dismiss selected
      </button>
      <select
        onChange={(e) => { if (e.target.value) onLink(e.target.value); e.target.value = "" }}
        defaultValue=""
        className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      >
        <option value="">Link to...</option>
        {applications.map((app) => (
          <option key={app.id} value={app.id}>
            {app.title} @ {app.company}
          </option>
        ))}
      </select>
      <div className="ml-auto flex gap-2">
        <button onClick={onSelectAll} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Select all</button>
        <button onClick={onDeselectAll} className="text-xs text-zinc-500 hover:underline">Deselect</button>
      </div>
    </div>
  )
}
