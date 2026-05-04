"use client"

import { usePathname } from "next/navigation"
import { format } from "date-fns"
import { Menu } from "lucide-react"
import { useSidebar } from "@/contexts/sidebar-context"

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
  const { toggleDrawer } = useSidebar()
  const now = new Date()

  return (
    <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={toggleDrawer}
        className="md:hidden -ml-1 inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md text-zinc-700 hover:bg-zinc-100 transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-lg font-bold text-zinc-900 leading-tight">
          {title}
        </h1>
        <p
          className="text-xs text-zinc-400 font-mono mt-0.5"
          suppressHydrationWarning
        >
          <span className="hidden sm:inline">{format(now, "EEEE, MMMM d, yyyy")}</span>
          <span className="sm:hidden">{format(now, "EEE, MMM d")}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
          {activeCount} active
        </span>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 whitespace-nowrap">
          {totalCount} total
        </span>
      </div>
    </header>
  )
}
