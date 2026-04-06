import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { DebriefStats } from "@/types/coaching"

interface DebriefRow {
  id: string
  user_id: string
  overall_rating: number | null
  created_at: string
}

function getStartOfISOWeek(): Date {
  const now = new Date()
  const day = now.getUTCDay()
  // ISO week starts on Monday (1). Sunday (0) maps to 6 days back.
  const daysToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToMonday
  ))
  return monday
}

export function calculateDebriefStats(debriefs: DebriefRow[]): DebriefStats {
  if (debriefs.length === 0) {
    return {
      total_debriefs: 0,
      average_rating: null,
      most_recent_at: null,
      debriefs_this_week: 0,
    }
  }

  const total_debriefs = debriefs.length

  // Average rating — exclude nulls from both sum and denominator
  const rated = debriefs.filter((d) => d.overall_rating !== null)
  const average_rating =
    rated.length > 0
      ? Math.round((rated.reduce((sum, d) => sum + d.overall_rating!, 0) / rated.length) * 10) / 10
      : null

  // Most recent — debriefs are ordered by created_at desc from the query
  const most_recent_at = debriefs[0].created_at

  // This week — created_at >= Monday 00:00 UTC
  const weekStart = getStartOfISOWeek()
  const debriefs_this_week = debriefs.filter(
    (d) => new Date(d.created_at) >= weekStart
  ).length

  return { total_debriefs, average_rating, most_recent_at, debriefs_this_week }
}

export async function GET() {
  // Placeholder — implemented in Task 3
  return NextResponse.json({})
}
