"use client"

import { formatDistanceToNow } from "date-fns"

interface RelativeTimeProps {
  date: string | Date
  className?: string
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const d = typeof date === "string" ? new Date(date) : date
  const relative = formatDistanceToNow(d, { addSuffix: true })
  const full = d.toLocaleString()

  return (
    <time dateTime={d.toISOString()} title={full} className={className}>
      {relative}
    </time>
  )
}
