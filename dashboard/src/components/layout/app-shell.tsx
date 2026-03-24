"use client"

import { useApplications } from "@/hooks/use-applications"
import { Header } from "@/components/layout/header"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { applications } = useApplications()

  const activeCount = applications.filter(
    (a) => !["rejected", "offer"].includes(a.status)
  ).length

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <Header activeCount={activeCount} totalCount={applications.length} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
