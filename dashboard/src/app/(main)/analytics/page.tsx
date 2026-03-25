"use client"

import { useApplications } from "@/hooks/use-applications"
import { useStats } from "@/hooks/use-stats"
import { KpiCard } from "@/components/shared/kpi-card"
import { SourceChart } from "@/components/analytics/source-chart"
import { PipelineFunnel } from "@/components/analytics/pipeline-funnel"
import { TimelineChart } from "@/components/analytics/timeline-chart"
import { EmptyState } from "@/components/shared/empty-state"
import {
  Briefcase,
  Send,
  MessageSquare,
  TrendingUp,
  BarChart3,
} from "lucide-react"

export default function AnalyticsPage() {
  const { applications, loading } = useApplications()
  const stats = useStats(applications)

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-bold mb-6">Analytics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (applications.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-bold">Analytics</h2>
        <EmptyState
          icon={BarChart3}
          title="Not enough data yet"
          description="Track some applications first to see analytics and trends."
          actions={[{ label: "Search Jobs", href: "/search" }]}
        />
      </div>
    )
  }

  const activeCount =
    (stats.by_status.interested || 0) +
    (stats.by_status.applied || 0) +
    (stats.by_status.phone_screen || 0) +
    (stats.by_status.interview || 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold">Analytics</h2>

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
          sub={`${stats.total > 0 ? ((stats.applied_count / stats.total) * 100).toFixed(0) : 0}% of tracked`}
          color="#3b82f6"
        />
        <KpiCard
          icon={MessageSquare}
          label="Response Rate"
          value={`${stats.response_rate.toFixed(0)}%`}
          sub={`${stats.responded_count} responses`}
          color="#10b981"
        />
        <KpiCard
          icon={TrendingUp}
          label="Active Pipeline"
          value={activeCount}
          sub="in progress"
          color="#8b5cf6"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SourceChart data={stats.source_distribution} />
        <PipelineFunnel byStatus={stats.by_status} />
      </div>

      {/* Timeline */}
      <TimelineChart data={stats.timeline} />
    </div>
  )
}
