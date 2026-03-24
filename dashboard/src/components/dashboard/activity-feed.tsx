"use client"

import { useEffect, useState } from "react"
import { fetchRecentActivity } from "@/hooks/use-activity-log"
import { Clock } from "lucide-react"
import type { ActivityEntry } from "@/types"

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

export function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentActivity(8).then((data) => {
      setEntries(data)
      setLoading(false)
    })
  }, [])

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        Recent Activity
      </h3>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-zinc-100" />
              <div className="flex-1 h-3 bg-zinc-100 rounded" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-zinc-400 text-center py-6">
          No recent activity
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock size={13} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-700 leading-relaxed">
                  {entry.action}
                </p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {timeAgo(entry.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
