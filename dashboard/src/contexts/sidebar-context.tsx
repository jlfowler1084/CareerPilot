"use client"

import { createContext, useCallback, useContext, useState } from "react"

type SidebarContextValue = {
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  toggleDrawer: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), [])
  return (
    <SidebarContext.Provider value={{ drawerOpen, setDrawerOpen, toggleDrawer }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return ctx
}
