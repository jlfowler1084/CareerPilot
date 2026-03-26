import Link from "next/link"
import type { LucideIcon } from "lucide-react"

interface KpiTrend {
  direction: "up" | "down" | "flat"
  delta: number
}

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  color: string
  href?: string
  trend?: KpiTrend
}

export function KpiCard({ icon: Icon, label, value, sub, color, href, trend }: KpiCardProps) {
  const content = (
    <>
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
      {trend && (
        <div
          className={`text-[10px] font-medium mt-1 ${
            trend.direction === "up"
              ? "text-emerald-600"
              : trend.direction === "down"
                ? "text-red-500"
                : "text-zinc-400"
          }`}
        >
          {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "—"}{" "}
          {trend.delta} from last week
        </div>
      )}
    </>
  )

  const className = "bg-white rounded-xl border border-zinc-200 p-5 hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}
