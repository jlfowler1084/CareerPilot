"use client"

import { useState, useMemo } from "react"
import { useTraining, useCourseDetail } from "@/hooks/use-training"
import type { TrainingCourse, TrainingProgress } from "@/hooks/use-training"
import { KpiCard } from "@/components/shared/kpi-card"
import { EmptyState } from "@/components/shared/empty-state"
import {
  GraduationCap,
  BookOpen,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  "not-started": { bg: "bg-zinc-100", text: "text-zinc-600", label: "Not Started" },
  "in-progress": { bg: "bg-amber-50", text: "text-amber-700", label: "In Progress" },
  "completed": { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completed" },
  "paused": { bg: "bg-slate-100", text: "text-slate-600", label: "Paused" },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES["not-started"]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  const fillColor = status === "completed" ? "bg-emerald-500" : "bg-amber-500"
  return (
    <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${fillColor}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function CourseCard({ course }: { course: TrainingCourse }) {
  const [expanded, setExpanded] = useState(false)
  const { progress, sessions, resources, loading: detailLoading } = useCourseDetail(
    course.id,
    expanded
  )

  // Group progress by module
  const modules = useMemo(() => {
    const map = new Map<number, { title: string | null; sections: TrainingProgress[] }>()
    for (const p of progress) {
      if (!map.has(p.module_number)) {
        map.set(p.module_number, { title: p.module_title, sections: [] })
      }
      map.get(p.module_number)!.sections.push(p)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [progress])

  // Aggregate weak areas
  const weakAreas = useMemo(() => {
    const all = progress.flatMap((p) => p.weak_areas || [])
    return [...new Set(all)]
  }, [progress])

  const targetDate = course.target_exam_date
    ? new Date(course.target_exam_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 text-left hover:bg-zinc-50/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-amber-600">
                {course.course_code}
              </span>
              <StatusBadge status={course.status} />
              {course.provider && (
                <span className="text-[10px] text-zinc-400 font-medium uppercase">
                  {course.provider}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 truncate">
              {course.course_name}
            </h3>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex-1 max-w-xs">
                <ProgressBar value={course.overall_progress} status={course.status} />
              </div>
              <span className="text-xs font-medium text-zinc-500">
                {course.completed_sections}/{course.total_sections} sections
              </span>
              {targetDate && (
                <span className="text-[10px] text-zinc-400">
                  Target: {targetDate}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 mt-1">
            {expanded ? (
              <ChevronDown size={16} className="text-zinc-400" />
            ) : (
              <ChevronRight size={16} className="text-zinc-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-100 p-5 space-y-5">
          {detailLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-zinc-100 rounded w-1/3" />
              <div className="h-20 bg-zinc-100 rounded" />
              <div className="h-4 bg-zinc-100 rounded w-1/4" />
              <div className="h-16 bg-zinc-100 rounded" />
            </div>
          ) : (
            <>
              {/* Module Breakdown */}
              {modules.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
                    Module Breakdown
                  </h4>
                  <div className="space-y-3">
                    {modules.map(([num, mod]) => {
                      const done = mod.sections.filter((s) => s.completed).length
                      const total = mod.sections.length
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0
                      return (
                        <div key={num} className="bg-zinc-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-zinc-700">
                              Module {num}{mod.title ? `: ${mod.title}` : ""}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {done}/{total} ({pct}%)
                            </span>
                          </div>
                          <ProgressBar
                            value={pct}
                            status={done === total ? "completed" : "in-progress"}
                          />
                          <div className="mt-2 flex flex-wrap gap-1">
                            {mod.sections.map((s) => (
                              <span
                                key={s.id}
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  s.completed
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-zinc-200 text-zinc-500"
                                }`}
                                title={s.section_title || `Section ${s.section_number}`}
                              >
                                {s.section_number}
                                {s.best_score != null ? ` (${s.best_score}%)` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Weak Areas */}
              {weakAreas.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                    Weak Areas
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {weakAreas.map((area, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Sessions */}
              {sessions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                    Recent Sessions
                  </h4>
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-700 capitalize">
                            {s.session_mode}
                          </span>
                          <span className="text-zinc-400">
                            {new Date(s.started_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        {s.duration_minutes != null && (
                          <span className="text-zinc-500">
                            {s.duration_minutes} min
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resources */}
              {resources.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                    Resources
                  </h4>
                  <div className="space-y-1.5">
                    {resources.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {r.completed ? (
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px]">
                              ✓
                            </span>
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-zinc-100 flex-shrink-0" />
                          )}
                          {r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-600 hover:underline truncate"
                            >
                              {r.title}
                            </a>
                          ) : (
                            <span className="text-zinc-700 truncate">{r.title}</span>
                          )}
                        </div>
                        {r.resource_type && (
                          <span className="text-[10px] text-zinc-400 capitalize flex-shrink-0 ml-2">
                            {r.resource_type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No detail data */}
              {modules.length === 0 && sessions.length === 0 && resources.length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">
                  No detailed progress data synced for this course yet.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function TrainingPage() {
  const { courses, loading, error, refetch } = useTraining()

  // Compute summary stats from courses list
  const stats = useMemo(() => {
    const active = courses.filter((c) => c.status === "in-progress")
    const avgProgress =
      active.length > 0
        ? Math.round(active.reduce((sum, c) => sum + c.overall_progress, 0) / active.length)
        : 0
    return {
      activeCourses: active.length,
      avgProgress,
      totalCourses: courses.length,
    }
  }, [courses])

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <h2 className="text-lg font-bold mb-2">Training</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-bold">Training</h2>
        <EmptyState
          icon={GraduationCap}
          title="No training courses synced yet"
          description="Run Sync-SBTrainingProgress from your SecondBrain terminal to push your training data here."
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Training</h2>
        <button
          onClick={refetch}
          className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={GraduationCap}
          label="Active Courses"
          value={stats.activeCourses}
          sub={`${stats.totalCourses} total`}
          color="#f59e0b"
        />
        <KpiCard
          icon={BookOpen}
          label="Avg Progress"
          value={`${stats.avgProgress}%`}
          sub="across active courses"
          color="#10b981"
        />
        <KpiCard
          icon={Clock}
          label="Study Hours"
          value="--"
          sub="sync sessions for data"
          color="#3b82f6"
        />
        <KpiCard
          icon={AlertCircle}
          label="Due for Review"
          value="--"
          sub="sync progress for data"
          color="#8b5cf6"
        />
      </div>

      {/* Course Cards */}
      <div className="space-y-3">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  )
}
