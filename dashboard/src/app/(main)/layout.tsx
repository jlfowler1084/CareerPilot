import { Sidebar } from "@/components/layout/sidebar"
import { AppShell } from "@/components/layout/app-shell"
import { ErrorBoundary } from "@/components/error-boundary"
import { SidebarProvider } from "@/contexts/sidebar-context"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <AppShell>
          <ErrorBoundary>{children}</ErrorBoundary>
        </AppShell>
      </div>
    </SidebarProvider>
  )
}
