"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Bot, Check, X, Clock, ArrowRight, SkipForward } from "lucide-react"
import { RelativeTime } from "@/components/ui/relative-time"

interface AutoApplyStats {
  today: { applied: number; failed: number; pending: number; skipped: number }
  week: { applied: number; failed: number }
  queue: { pending: number; approved: number; generating: number; ready: number; applying: number }
  dailyLimit: { used: number; max: number }
  recent: Array<{ id: string; title: string; company: string; status: string; updatedAt: string }>
  costEstimate: { todayCost: number; weekCost: number }
}

export function AutoApplyWidget() {
  const [stats, setStats] = useState<AutoApplyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auto-apply/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setStats(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <div className="h-48 bg-zinc-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!stats) return null

  const dailyPct = stats.dailyLimit.max > 0
    ? Math.round((stats.dailyLimit.used / stats.dailyLimit.max) * 100)
    : 0

  const queueTotal = stats.queue.pending + stats.queue.approved + stats.queue.generating + stats.queue.ready + stats.queue.applying

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-blue-500" />
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Auto-Apply Pipeline
          </h3>
        </div>
        <Link
          href="/settings"
          className="text-[10px] text-zinc-400 hover:text-amber-600 transition-colors"
        >
          Settings
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Today</p>
          <p className="text-sm text-zinc-800 font-mono mt-0.5">
            {stats.today.applied} applied · {stats.today.failed} failed · {stats.today.pending} pending
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">This Week</p>
          <p className="text-sm text-zinc-800 font-mono mt-0.5">
            {stats.week.applied} applied · {stats.week.failed} failed
          </p>
        </div>
      </div>

      {/* Queue summary */}
      <div>
        <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Queue</p>
        <p className="text-sm text-zinc-800 font-mono mt-0.5">
          {stats.queue.ready} ready · {stats.queue.generating} generating · {stats.queue.pending} pending
          {queueTotal === 0 && <span className="text-zinc-400"> — empty</span>}
        </p>
      </div>

      {/* Daily limit bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-zinc-400">{dailyPct}% daily limit ({stats.dailyLimit.used}/{stats.dailyLimit.max})</p>
          <p className="text-[10px] text-zinc-400">
            Est. cost: ${stats.costEstimate.todayCost.toFixed(2)} today · ${stats.costEstimate.weekCost.toFixed(2)} week
          </p>
        </div>
        <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${dailyPct >= 90 ? "bg-red-500" : dailyPct >= 60 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, dailyPct)}%` }}
          />
        </div>
      </div>

      {/* Recent applications */}
      {stats.recent.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Recent</p>
          <div className="space-y-1.5">
            {stats.recent.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                {item.status === "applied" && <Check size={12} className="text-emerald-500 flex-shrink-0" />}
                {item.status === "failed" && <X size={12} className="text-red-500 flex-shrink-0" />}
                {item.status === "skipped" && <SkipForward size={12} className="text-zinc-400 flex-shrink-0" />}
                <span className="text-zinc-700 truncate flex-1">
                  {item.title} <span className="text-zinc-400">@ {item.company}</span>
                </span>
                <RelativeTime date={item.updatedAt} className="text-[10px] text-zinc-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action links */}
      <div className="flex items-center gap-3 pt-1 border-t border-zinc-100">
        <Link href="/search?tab=queue" className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1">
          View Queue <ArrowRight size={10} />
        </Link>
        <Link href="/settings" className="text-[10px] font-semibold text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
          Settings <ArrowRight size={10} />
        </Link>
      </div>
    </div>
  )
}
