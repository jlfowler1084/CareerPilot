"use client"

import { STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

interface PipelineFunnelProps {
  byStatus: Record<ApplicationStatus, number>
}

export function PipelineFunnel({ byStatus }: PipelineFunnelProps) {
  const maxCount = Math.max(
    ...STATUSES.map((s) => byStatus[s.id] || 0),
    1
  )

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        Pipeline Funnel
      </h3>
      <div className="space-y-2">
        {STATUSES.map((s) => {
          const count = byStatus[s.id] || 0
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
          return (
            <div key={s.id} className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500 w-24 text-right truncate">
                {s.label}
              </span>
              <div className="flex-1 h-6 bg-zinc-50 rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, count > 0 ? 3 : 0)}%`,
                    background: s.color,
                    opacity: 0.8,
                  }}
                />
                {count > 0 && (
                  <span
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold"
                    style={{ color: pct > 50 ? "#fff" : s.color }}
                  >
                    {count}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
