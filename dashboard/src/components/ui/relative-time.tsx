"use client"

import { formatDistanceToNow, format } from "date-fns"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface RelativeTimeProps {
  date: string | Date
  className?: string
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const d = typeof date === "string" ? new Date(date) : date
  const relative = formatDistanceToNow(d, { addSuffix: true })
  const full = format(d, "MMM d, yyyy 'at' h:mm a")

  return (
    <Tooltip>
      <TooltipTrigger
        render={<time dateTime={d.toISOString()} className={className} />}
      >
        {relative}
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  )
}
