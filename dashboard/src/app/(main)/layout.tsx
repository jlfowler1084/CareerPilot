import { Sidebar } from "@/components/layout/sidebar"
import { AppShell } from "@/components/layout/app-shell"
import { ErrorBoundary } from "@/components/error-boundary"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <AppShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppShell>
    </div>
  )
}
