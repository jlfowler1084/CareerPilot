"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

interface TimelineChartProps {
  data: { date: string; count: number }[]
}

export function TimelineChart({ data }: TimelineChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
          Timeline (Last 14 Days)
        </h3>
        <div className="flex items-center justify-center h-48 text-sm text-zinc-400">
          No data
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        Timeline (Last 14 Days)
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, maxCount + 1]}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e4e4e7",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", r: 3 }}
              activeDot={{ r: 5 }}
              name="Jobs Found"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
