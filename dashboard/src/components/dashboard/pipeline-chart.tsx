"use client"

import { useRouter } from "next/navigation"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

interface PipelineChartProps {
  byStatus: Record<ApplicationStatus, number>
}

export function PipelineChart({ byStatus }: PipelineChartProps) {
  const router = useRouter()
  const data = STATUSES.map((s) => ({
    name: s.label,
    value: byStatus[s.id] || 0,
    color: s.color,
    statusId: s.id,
  })).filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
          Pipeline
        </h3>
        <div className="flex items-center justify-center h-48 text-sm text-zinc-400">
          No applications yet
        </div>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 min-w-0">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        Pipeline
      </h3>
      <div className="flex items-center gap-4">
        <div className="w-48 h-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.color}
                    className="cursor-pointer outline-none"
                    onClick={() => router.push(`/applications?status=${entry.statusId}`)}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e4e4e7",
                  fontSize: "12px",
                }}
                formatter={(value, name) => [
                  `${value} (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`,
                  String(name),
                ]}
              />
              <text
                x="50%"
                y="48%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-2xl font-bold fill-zinc-900"
              >
                {total}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] fill-zinc-400"
              >
                total
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {data.map((d) => (
            <button
              type="button"
              key={d.name}
              onClick={() => router.push(`/applications?status=${d.statusId}`)}
              className="flex items-center gap-2 text-xs hover:bg-zinc-50 rounded-md px-1.5 py-1 -mx-1.5 transition-colors cursor-pointer"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-zinc-600 truncate">{d.name}</span>
              <span className="font-bold text-zinc-900 ml-auto">{d.value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
