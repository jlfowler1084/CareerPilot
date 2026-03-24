"use client"

import { usePathname } from "next/navigation"
import { format } from "date-fns"

const VIEW_TITLES: Record<string, string> = {
  "/": "Overview",
  "/search": "Job Search",
  "/applications": "Applications",
  "/analytics": "Analytics",
}

interface HeaderProps {
  activeCount: number
  totalCount: number
}

export function Header({ activeCount, totalCount }: HeaderProps) {
  const pathname = usePathname()
  const title = VIEW_TITLES[pathname] || "Dashboard"

  return (
    <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
        <p className="text-xs text-zinc-400 font-mono mt-0.5">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          {activeCount} active
        </span>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
          {totalCount} total
        </span>
      </div>
    </header>
  )
}
