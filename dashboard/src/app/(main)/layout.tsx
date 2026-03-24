import { Sidebar } from "@/components/layout/sidebar"
import { AppShell } from "@/components/layout/app-shell"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <AppShell>{children}</AppShell>
    </div>
  )
}
