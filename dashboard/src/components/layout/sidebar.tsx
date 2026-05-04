"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import { useSidebar } from "@/contexts/sidebar-context"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { LayoutDashboard, Search, Briefcase, BarChart3, ChevronRight, Mail, MessageSquare, Settings, Rocket, GraduationCap, Users } from "lucide-react"

const NAV_ITEMS = [
  { id: "overview", href: "/", label: "Overview", icon: LayoutDashboard },
  { id: "inbox", href: "/inbox", label: "Inbox", icon: Mail },
  { id: "search", href: "/search", label: "Job Search", icon: Search },
  { id: "applications", href: "/applications", label: "Applications", icon: Briefcase },
  { id: "auto-apply", href: "/auto-apply", label: "Auto-Apply", icon: Rocket },
  { id: "conversations", href: "/conversations", label: "Conversations", icon: MessageSquare },
  { id: "contacts", href: "/contacts", label: "Contacts", icon: Users },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: BarChart3 },
  { id: "training", href: "/training", label: "Training", icon: GraduationCap },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings },
]

const ACTIVE_STATUSES = ["interested", "applied", "phone_screen", "interview"]

function useActiveAppCount() {
  const { user } = useAuth()
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
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
  }, [user])
  return count
}

function useApprovedQueueCount() {
  const { user } = useAuth()
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("auto_apply_queue")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "approved")
      setCount(c ?? 0)
    }
    fetchCount()

    const channel = supabase
      .channel("sidebar-queue-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auto_apply_queue" },
        () => fetchCount()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])
  return count
}

function useSearchResultsNewCount() {
  const { user } = useAuth()
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("job_search_results")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "new")
      setCount(c ?? 0)
    }
    fetchCount()

    const channel = supabase
      .channel("sidebar-search-results-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_search_results" },
        () => fetchCount()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])
  return count
}

interface SidebarBodyProps {
  collapsed: boolean
  onNavigate?: () => void
}

function SidebarBody({ collapsed, onNavigate }: SidebarBodyProps) {
  const pathname = usePathname()
  const activeCount = useActiveAppCount()
  const approvedQueueCount = useApprovedQueueCount()
  const newSearchResultsCount = useSearchResultsNewCount()

  return (
    <>
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-sm text-zinc-900 flex-shrink-0">
            CP
          </div>
          {!collapsed && (
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
              onClick={onNavigate}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all min-h-[44px] ${
                active
                  ? "bg-zinc-800 text-amber-400 font-bold border-r-2 border-amber-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && (
                <span className="flex-1 flex items-center justify-between">
                  {item.label}
                  {item.id === "applications" && activeCount !== null && activeCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-zinc-900 leading-none">
                      {activeCount}
                    </span>
                  )}
                  {item.id === "auto-apply" && approvedQueueCount !== null && approvedQueueCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white leading-none">
                      {approvedQueueCount}
                    </span>
                  )}
                  {item.id === "search" && newSearchResultsCount !== null && newSearchResultsCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white leading-none">
                      {newSearchResultsCount}
                    </span>
                  )}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 flex-shrink-0">
            JF
          </div>
          {!collapsed && (
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
    </>
  )
}

function DesktopSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-56"} hidden md:flex flex-shrink-0 bg-zinc-900 text-white transition-all duration-300 flex-col`}
    >
      <SidebarBody collapsed={collapsed} />
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-3 border-t border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center min-h-[44px]"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronRight
          size={16}
          className={`transition-transform ${!collapsed ? "rotate-180" : ""}`}
        />
      </button>
    </aside>
  )
}

function MobileSidebarDrawer() {
  const { drawerOpen, setDrawerOpen } = useSidebar()
  const pathname = usePathname()

  // Close the drawer whenever the route changes — backstop for browser back/forward
  // and any nav we don't catch via onClick (e.g., programmatic router pushes).
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname, setDrawerOpen])

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-56 max-w-[80vw] bg-zinc-900 text-white border-r border-zinc-800 ring-0 p-0"
      >
        <SidebarBody collapsed={false} onNavigate={() => setDrawerOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

export function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebarDrawer />
    </>
  )
}
