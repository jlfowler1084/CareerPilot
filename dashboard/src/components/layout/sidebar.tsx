"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Search, Briefcase, BarChart3, MessageSquare, ChevronRight } from "lucide-react"

const NAV_ITEMS = [
  { id: "overview", href: "/", label: "Overview", icon: LayoutDashboard },
  { id: "search", href: "/search", label: "Job Search", icon: Search },
  { id: "applications", href: "/applications", label: "Applications", icon: Briefcase },
  { id: "conversations", href: "/conversations", label: "Conversations", icon: MessageSquare },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: BarChart3 },
]

export function Sidebar() {
  const [open, setOpen] = useState(true)
  const pathname = usePathname()

  return (
    <aside
      className={`${open ? "w-56" : "w-16"} flex-shrink-0 bg-zinc-900 text-white transition-all duration-300 flex flex-col`}
    >
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-sm text-zinc-900 flex-shrink-0">
            CP
          </div>
          {open && (
            <div>
              <div className="font-bold text-sm leading-tight">Career Pilot</div>
              <div className="text-[10px] text-zinc-500 font-mono">v2.0</div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
                active
                  ? "bg-zinc-800 text-amber-400 font-bold border-r-2 border-amber-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {open && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => setOpen(!open)}
        className="p-3 border-t border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center"
      >
        <ChevronRight
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 flex-shrink-0">
            JF
          </div>
          {open && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                Joseph Fowler
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                Sheridan, IN
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
