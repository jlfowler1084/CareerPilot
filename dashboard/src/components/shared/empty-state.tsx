import type { LucideIcon } from "lucide-react"
import Link from "next/link"

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actions?: EmptyStateAction[]
}

export function EmptyState({ icon: Icon, title, description, actions }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-zinc-400" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-800 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 mb-5 max-w-xs mx-auto">{description}</p>
      {actions && actions.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          {actions.map((action, i) =>
            action.href ? (
              <Link
                key={i}
                href={action.href}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={i}
                onClick={action.onClick}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
