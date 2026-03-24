import { useMemo } from "react"
import { STATUSES } from "@/lib/constants"
import type { Application, ApplicationStatus } from "@/types"

export interface Stats {
  total: number
  by_status: Record<ApplicationStatus, number>
  applied_count: number
  responded_count: number
  response_rate: number
  source_distribution: { name: string; value: number }[]
}

export function computeStats(applications: Application[]): Stats {
  const total = applications.length

  const by_status = {} as Record<ApplicationStatus, number>
  for (const s of STATUSES) {
    by_status[s.id] = 0
  }
  for (const app of applications) {
    by_status[app.status] = (by_status[app.status] || 0) + 1
  }

  const applied_count = applications.filter((a) => a.date_applied).length
  const responded_count = applications.filter(
    (a) => a.date_applied && a.date_response
  ).length
  const response_rate =
    applied_count > 0 ? (responded_count / applied_count) * 100 : 0

  const sourceCounts: Record<string, number> = {}
  for (const app of applications) {
    const src = app.source || "Unknown"
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  }
  const source_distribution = Object.entries(sourceCounts).map(
    ([name, value]) => ({ name, value })
  )

  return {
    total,
    by_status,
    applied_count,
    responded_count,
    response_rate,
    source_distribution,
  }
}

export function computeWeeklyActivity(
  applications: Application[],
  weeks: number = 6
): { week: string; count: number }[] {
  const result: { week: string; count: number }[] = []
  const now = new Date()

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)
    const weekLabel = `W${Math.ceil(weekStart.getDate() / 7)}`

    const count = applications.filter((a) => {
      const d = new Date(a.date_found)
      return d >= weekStart && d < weekEnd
    }).length

    result.push({ week: weekLabel, count })
  }

  return result
}

export function computeTimeline(
  applications: Application[],
  days: number = 14
): { date: string; count: number }[] {
  const counts: Record<string, number> = {}

  for (const app of applications) {
    const d = new Date(app.date_found).toLocaleDateString()
    counts[d] = (counts[d] || 0) + 1
  }

  return Object.entries(counts)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .slice(-days)
    .map(([date, count]) => ({ date, count }))
}

export function useStats(applications: Application[]): Stats & {
  weekly: { week: string; count: number }[]
  timeline: { date: string; count: number }[]
} {
  return useMemo(() => ({
    ...computeStats(applications),
    weekly: computeWeeklyActivity(applications),
    timeline: computeTimeline(applications),
  }), [applications])
}
