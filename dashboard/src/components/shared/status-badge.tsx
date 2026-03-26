import { STATUS_CONFIG } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

interface StatusBadgeProps {
  status: ApplicationStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.found
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  )
}
