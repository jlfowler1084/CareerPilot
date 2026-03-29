"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LayoutDashboard, Search, Briefcase, BarChart3, ChevronRight, Mail, MessageSquare, Settings } from "lucide-react"

const NAV_ITEMS = [
  { id: "overview", href: "/", label: "Overview", icon: LayoutDashboard },
  { id: "inbox", href: "/inbox", label: "Inbox", icon: Mail },
  { id: "search", href: "/search", label: "Job Search", icon: Search },
  { id: "applications", href: "/applications", label: "Applications", icon: Briefcase },
  { id: "conversations", href: "/conversations", label: "Conversations", icon: MessageSquare },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings },
]

const ACTIVE_STATUSES = ["interested", "applied", "phone_screen", "interview"]

function useActiveAppCount() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const supabase = createClient()
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .in("status", ACTIVE_STATUSES)
      setCount(c ?? 0)
    }
    fetchCount()

    const channel = supabase
      .channel("sidebar-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        () => fetchCount()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])
  return count
}

export function Sidebar() {
  const [open, setOpen] = useState(true)
  const pathname = usePathname()
  const activeCount = useActiveAppCount()

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
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all min-h-[44px] ${
                active
                  ? "bg-zinc-800 text-amber-400 font-bold border-r-2 border-amber-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {open && (
                <span className="flex-1 flex items-center justify-between">
                  {item.label}
                  {item.id === "applications" && activeCount !== null && activeCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-zinc-900 leading-none">
                      {activeCount}
                    </span>
                  )}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => setOpen(!open)}
        className="p-3 border-t border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center min-h-[44px]"
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
