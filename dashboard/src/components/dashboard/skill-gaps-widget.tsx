"use client"

import { useSkillGaps } from "@/hooks/use-interview-prep"
import { BookOpen } from "lucide-react"
import type { Application } from "@/types"

interface SkillGapsWidgetProps {
  applications: Application[]
}

export function SkillGapsWidget({ applications }: SkillGapsWidgetProps) {
  const { skills } = useSkillGaps(applications)

  if (skills.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-violet-50">
          <BookOpen size={14} className="text-violet-600" />
        </div>
        <h3 className="text-sm font-bold text-zinc-800">Top Skills to Study</h3>
      </div>
      <div className="space-y-2">
        {skills.map(({ skill, count }) => (
          <div key={skill} className="flex items-center justify-between">
            <span className="text-xs text-zinc-700 capitalize">{skill}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">
              {count} {count === 1 ? "role" : "roles"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
