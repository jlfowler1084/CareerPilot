"use client"

import { useMemo, useEffect, useState } from "react"
import Link from "next/link"
import { useApplications } from "@/hooks/use-applications"
import { computeStats } from "@/hooks/use-stats"
import { createClient } from "@/lib/supabase/client"
import { STATUSES } from "@/lib/constants"
import { EmptyState } from "@/components/shared/empty-state"
import { RelativeTime } from "@/components/ui/relative-time"
import {
  Rocket,
  Search,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ArrowRight,
} from "lucide-react"
import type { Application, ApplicationEvent, ApplicationStatus } from "@/types"

const supabase = createClient()

// --- Event type icons ---
const EVENT_ICONS: Record<string, string> = {
  status_change: "\uD83D\uDD04",
  note_added: "\uD83D\uDCDD",
  resume_tailored: "\u2728",
  calendar_scheduled: "\uD83D\uDCC5",
  contact_added: "\uD83D\uDC64",
  follow_up: "\uD83D\uDCDE",
}

// --- Alerts computation ---
interface Alert {
  id: string
  appId: string
  type: "stale" | "follow_up_overdue" | "upcoming_interview"
  title: string
  company: string
  message: string
}

function computeAlerts(applications: Application[]): Alert[] {
  const now = new Date()
  const alerts: Alert[] = []

  for (const app of applications) {
    // Stale: applied > 7 days ago with no response
    if (
      app.status === "applied" &&
      app.date_applied &&
      !app.date_response
    ) {
      const applied = new Date(app.date_applied)
      const diff = (now.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24)
      if (diff > 7) {
        alerts.push({
          id: `stale-${app.id}`,
          appId: app.id,
          type: "stale",
          title: app.title,
          company: app.company,
          message: `No response in ${Math.floor(diff)} days`,
        })
      }
    }

    // Follow-up overdue
    if (app.follow_up_date && new Date(app.follow_up_date) < now) {
      alerts.push({
        id: `followup-${app.id}`,
        appId: app.id,
        type: "follow_up_overdue",
        title: app.title,
        company: app.company,
        message: "Follow-up overdue",
      })
    }

    // Upcoming interview (within 3 days)
    if (app.interview_date) {
      const interview = new Date(app.interview_date)
      const diff = (interview.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (diff >= 0 && diff <= 3) {
        alerts.push({
          id: `interview-${app.id}`,
          appId: app.id,
          type: "upcoming_interview",
          title: app.title,
          company: app.company,
          message: `Interview ${diff < 1 ? "today" : `in ${Math.ceil(diff)} day${Math.ceil(diff) > 1 ? "s" : ""}`}`,
        })
      }
    }
  }

  return alerts
}

// --- Weekly stats ---
function computeWeeklyStats(applications: Application[]) {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const appliedThisWeek = applications.filter(
    (a) => a.date_applied && new Date(a.date_applied) >= startOfWeek
  ).length

  const foundThisWeek = applications.filter(
    (a) => new Date(a.date_found) >= startOfWeek
  ).length

  const totalApplied = applications.filter((a) => a.date_applied).length
  const totalResponded = applications.filter(
    (a) => a.date_applied && a.date_response
  ).length
  const responseRate = totalApplied > 0
    ? Math.round((totalResponded / totalApplied) * 100)
    : 0

  const sourceCounts: Record<string, number> = {}
  for (const app of applications) {
    const src = app.source || "Manual"
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  }
  const total = applications.length || 1

  return {
    appliedThisWeek,
    foundThisWeek,
    responseRate,
    sourceCounts,
    total,
  }
}

export default function OverviewPage() {
  const { applications, loading } = useApplications()
  const stats = useMemo(() => computeStats(applications), [applications])
  const alerts = useMemo(() => computeAlerts(applications), [applications])
  const weekly = useMemo(() => computeWeeklyStats(applications), [applications])

  // Fetch recent application events for activity feed
  const [events, setEvents] = useState<ApplicationEvent[]>([])
  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("application_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10)
      setEvents(data || [])
    }
    fetchEvents()
  }, [])

  // Upcoming calendar events from applications
  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const items: { title: string; company: string; date: string; type: string }[] = []

    for (const app of applications) {
      if (app.interview_date && new Date(app.interview_date) > now) {
        items.push({
          title: app.title,
          company: app.company,
          date: app.interview_date,
          type: "Interview",
        })
      }
      if (app.follow_up_date && new Date(app.follow_up_date) > now) {
        items.push({
          title: app.title,
          company: app.company,
          date: app.follow_up_date,
          type: "Follow-up",
        })
      }
    }

    return items
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3)
  }, [applications])

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

  if (applications.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-bold">Overview</h2>
        <EmptyState
          icon={Rocket}
          title="Start your job search"
          description="Welcome to Career Pilot! Begin by searching for jobs or adding an application manually."
          actions={[
            { label: "Run Job Search", href: "/search" },
            { label: "Add Application", href: "/applications" },
          ]}
        />
      </div>
    )
  }

  // Count active applications (not terminal states)
  const activeCount =
    (stats.by_status.interested || 0) +
    (stats.by_status.applied || 0) +
    (stats.by_status.phone_screen || 0) +
    (stats.by_status.interview || 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold">Overview</h2>

      {/* Quick Actions Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/search"
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
        >
          <Search size={14} />
          Run Job Search
        </Link>
        <Link
          href="/applications"
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-zinc-50 text-zinc-700 hover:bg-zinc-100 border border-zinc-200 transition-colors"
        >
          <Plus size={14} />
          Add Application
        </Link>
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
        >
          <Calendar size={14} />
          View Calendar
        </a>
      </div>

      {/* KPI Status Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {STATUSES.map((s) => {
          const count = stats.by_status[s.id] || 0
          const isStaleApplied =
            s.id === "applied" &&
            alerts.some((a) => a.type === "stale")

          return (
            <Link
              key={s.id}
              href={`/applications?status=${s.id}`}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-md hover:scale-[1.02] ${
                isStaleApplied
                  ? "border-amber-300 bg-amber-50"
                  : count > 0
                    ? "border-zinc-200 bg-white"
                    : "border-zinc-100 bg-zinc-50/50"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: s.color }}
                />
                <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider truncate">
                  {s.label}
                </span>
              </div>
              <div
                className="text-xl font-bold"
                style={{ color: count > 0 ? s.color : "#d4d4d8" }}
              >
                {count}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Two-column layout: Alerts + Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts Section */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
            Attention Needed
          </h3>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert) => (
                <Link
                  key={alert.id}
                  href={`/applications?status=${alert.type === "stale" ? "applied" : alert.type === "upcoming_interview" ? "interview" : ""}`}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <AlertTriangle
                    size={14}
                    className={
                      alert.type === "upcoming_interview"
                        ? "text-blue-500 mt-0.5"
                        : "text-amber-500 mt-0.5"
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800 truncate">
                      {alert.title}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {alert.company} &middot; {alert.message}
                    </p>
                  </div>
                  <ArrowRight size={12} className="text-zinc-300 mt-1 flex-shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-600 py-4">
              <CheckCircle2 size={16} />
              <span>All caught up!</span>
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
            Upcoming Events
          </h3>
          {upcomingEvents.length > 0 ? (
            <div className="space-y-2">
              {upcomingEvents.map((event, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <CalendarDays size={14} className="text-blue-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800 truncate">
                      {event.type}: {event.title}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {event.company} &middot;{" "}
                      {new Date(event.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-400 py-4">
              No upcoming events
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout: Activity Feed + Weekly Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
            Recent Activity
          </h3>
          {events.length > 0 ? (
            <div className="space-y-1">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <span className="mt-0.5 text-sm leading-none">
                    {EVENT_ICONS[event.event_type] || "\u2022"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-700 leading-relaxed">
                      {event.description}
                    </p>
                    <RelativeTime
                      date={event.created_at}
                      className="text-[10px] text-zinc-400 mt-0.5 block"
                    />
                  </div>
                </div>
              ))}
              <Link
                href="/applications"
                className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 transition-colors block text-center pt-2"
              >
                View all applications
              </Link>
            </div>
          ) : (
            <div className="text-sm text-zinc-400 text-center py-6">
              No recent activity
            </div>
          )}
        </div>

        {/* Weekly Stats */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
            This Week
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <div className="text-2xl font-bold text-zinc-900">
                {weekly.appliedThisWeek}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Applied
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900">
                {weekly.foundThisWeek}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Jobs Found
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900">
                {weekly.responseRate}%
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Response Rate
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900">{activeCount}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Active Pipeline
              </div>
            </div>
          </div>

          {/* Source breakdown bar */}
          <div className="space-y-2">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              Sources
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-zinc-100">
              {Object.entries(weekly.sourceCounts).map(([source, count]) => {
                const pct = (count / weekly.total) * 100
                const colors: Record<string, string> = {
                  Indeed: "#2557a7",
                  Dice: "#0c7ff2",
                  Manual: "#f59e0b",
                }
                return (
                  <div
                    key={source}
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: colors[source] || "#94a3b8",
                    }}
                    title={`${source}: ${count}`}
                  />
                )
              })}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {Object.entries(weekly.sourceCounts).map(([source, count]) => {
                const colors: Record<string, string> = {
                  Indeed: "#2557a7",
                  Dice: "#0c7ff2",
                  Manual: "#f59e0b",
                }
                return (
                  <div key={source} className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: colors[source] || "#94a3b8" }}
                    />
                    {source}: {count}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
