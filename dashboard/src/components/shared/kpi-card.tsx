import type { LucideIcon } from "lucide-react"

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  color: string
}

export function KpiCard({ icon: Icon, label, value, sub, color }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold text-zinc-900 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
    </div>
  )
}
