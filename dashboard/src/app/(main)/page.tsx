"use client"

import { useApplications } from "@/hooks/use-applications"
import { useStats } from "@/hooks/use-stats"
import { KpiCard } from "@/components/shared/kpi-card"
import { PipelineChart } from "@/components/dashboard/pipeline-chart"
import { WeeklyChart } from "@/components/dashboard/weekly-chart"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import {
  Briefcase,
  Send,
  MessageSquare,
  TrendingUp,
} from "lucide-react"

export default function OverviewPage() {
  const { applications, loading } = useApplications()
  const stats = useStats(applications)

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-bold mb-6">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold">Overview</h2>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Briefcase}
          label="Total Jobs"
          value={stats.total}
          sub="in pipeline"
          color="#f59e0b"
        />
        <KpiCard
          icon={Send}
          label="Applied"
          value={stats.applied_count}
          sub={`of ${stats.total} tracked`}
          color="#3b82f6"
        />
        <KpiCard
          icon={MessageSquare}
          label="Responses"
          value={stats.responded_count}
          sub={`${stats.response_rate.toFixed(0)}% rate`}
          color="#10b981"
        />
        <KpiCard
          icon={TrendingUp}
          label="Active"
          value={
            (stats.by_status.interested || 0) +
            (stats.by_status.applied || 0) +
            (stats.by_status.phone_screen || 0) +
            (stats.by_status.interview || 0)
          }
          sub="in progress"
          color="#8b5cf6"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineChart byStatus={stats.by_status} />
        <WeeklyChart data={stats.weekly} />
      </div>

      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  )
}
