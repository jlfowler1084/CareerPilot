"use client"

import { STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

interface KanbanSummaryProps {
  byStatus: Record<ApplicationStatus, number>
  activeFilter: ApplicationStatus | null
  onFilter: (status: ApplicationStatus | null) => void
}

export function KanbanSummary({
  byStatus,
  activeFilter,
  onFilter,
}: KanbanSummaryProps) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
      {STATUSES.map((s) => {
        const count = byStatus[s.id] || 0
        const active = activeFilter === s.id
        return (
          <button
            key={s.id}
            onClick={() => onFilter(active ? null : s.id)}
            className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${
              active
                ? "border-amber-300 bg-amber-50 shadow-sm"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider truncate">
                {s.label}
              </span>
            </div>
            <div
              className="text-xl font-bold"
              style={{ color: count > 0 ? s.color : "#d4d4d8" }}
            >
              {count}
            </div>
          </button>
        )
      })}
    </div>
  )
}
