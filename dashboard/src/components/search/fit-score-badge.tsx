"use client"

import { useState } from "react"
import type { FitScore } from "@/types"

interface FitScoreBadgeProps {
  score: FitScore
  size?: "sm" | "md"
}

export function FitScoreBadge({ score, size = "sm" }: FitScoreBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const { total, breakdown, matchedSkills } = score

  const tier = total >= 80 ? "high" : total >= 60 ? "mid" : "low"

  const colors = {
    high: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
    mid: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700",
    low: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600",
  }

  const sizeClasses = size === "md"
    ? "text-xs px-2 py-1 font-bold"
    : "text-[10px] px-1.5 py-0.5 font-bold"

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`rounded border font-mono ${sizeClasses} ${colors[tier]} flex items-center gap-1`}>
        {total}
        {tier === "high" && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>

      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-zinc-900 dark:bg-zinc-800 text-white rounded-lg shadow-xl p-3 text-[11px] pointer-events-none">
          <div className="font-bold mb-2 text-center">
            Fit Score: {total}/100
          </div>
          <div className="space-y-1.5">
            <ScoreRow label="Title Match" value={breakdown.title} max={30} />
            <ScoreRow label="Skills" value={breakdown.skills} max={40} />
            <ScoreRow label="Location" value={breakdown.location} max={15} />
            <ScoreRow label="Salary" value={breakdown.salary} max={15} />
          </div>
          {matchedSkills.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-700">
              <div className="text-[10px] text-zinc-400 mb-1">Matched Skills</div>
              <div className="flex flex-wrap gap-1">
                {matchedSkills.slice(0, 6).map((s) => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300">
                    {s}
                  </span>
                ))}
                {matchedSkills.length > 6 && (
                  <span className="text-[9px] text-zinc-500">+{matchedSkills.length - 6}</span>
                )}
              </div>
            </div>
          )}
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-zinc-900 dark:bg-zinc-800 rotate-45" />
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-zinc-400 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono">{value}/{max}</span>
    </div>
  )
}
