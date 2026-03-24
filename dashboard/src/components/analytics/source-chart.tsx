"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts"

interface SourceChartProps {
  data: { name: string; value: number }[]
}

const COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#6b7280",
]

export function SourceChart({ data }: SourceChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
          By Source
        </h3>
        <div className="flex items-center justify-center h-48 text-sm text-zinc-400">
          No data
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        By Source
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e4e4e7",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="value" name="Applications" radius={[0, 4, 4, 0]} barSize={20}>
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
