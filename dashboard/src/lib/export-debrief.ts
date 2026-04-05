import type { DebriefRecord } from "@/types"

interface ExportContext {
  company: string
  title: string
}

export function exportDebriefMarkdown(debrief: DebriefRecord, context: ExportContext) {
  const analysis = debrief.ai_analysis as Record<string, unknown> | null
  const date = new Date(debrief.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const lines: string[] = [
    `# Interview Debrief — ${context.company} ${context.title}`,
    `**Date:** ${date}`,
    `**Stage:** ${debrief.stage}`,
    "",
  ]

  if (analysis?.summary) {
    lines.push("## Analysis Summary", String(analysis.summary), "")
  }

  // Strong points / strengths
  const strengths = analysis?.strong_points as string[] | undefined
  if (strengths && strengths.length > 0) {
    lines.push("## Strengths")
    for (const s of strengths) lines.push(`- ${s}`)
    lines.push("")
  }

  // Improvements
  const improvements = analysis?.improvements as Array<{ area: string; tip?: string }> | undefined
  if (improvements && improvements.length > 0) {
    lines.push("## Areas for Improvement")
    for (const imp of improvements) {
      lines.push(`- **${imp.area}**${imp.tip ? `: ${imp.tip}` : ""}`)
    }
    lines.push("")
  }

  // Top focus areas / study recommendations
  const focusAreas = analysis?.top_3_focus_areas as string[] | undefined
  if (focusAreas && focusAreas.length > 0) {
    lines.push("## Study Recommendations")
    for (const area of focusAreas) lines.push(`- ${area}`)
    lines.push("")
  }

  // Question analyses as patterns
  const questionAnalyses = analysis?.question_analyses as Array<{ question: string; score: number; feedback: string }> | undefined
  if (questionAnalyses && questionAnalyses.length > 0) {
    lines.push("## Patterns Detected")
    for (const qa of questionAnalyses) {
      lines.push(`- **${qa.question}** (${qa.score}/10): ${qa.feedback}`)
    }
    lines.push("")
  }

  // Raw notes
  lines.push("## Raw Notes")
  if (debrief.went_well) lines.push(`**What went well:** ${debrief.went_well}`)
  if (debrief.was_hard) lines.push(`**What was hard:** ${debrief.was_hard}`)
  if (debrief.topics_covered && debrief.topics_covered.length > 0) {
    lines.push(`**Topics covered:** ${debrief.topics_covered.join(", ")}`)
  }
  if (debrief.key_takeaways && debrief.key_takeaways.length > 0) {
    lines.push(`**Key takeaways:** ${debrief.key_takeaways.join(", ")}`)
  }
  lines.push("")

  const markdown = lines.join("\n")
  const blob = new Blob([markdown], { type: "text/markdown" })
  const url = URL.createObjectURL(blob)

  const slug = context.company.toLowerCase().replace(/\s+/g, "-")
  const stageSlug = debrief.stage.toLowerCase().replace(/\s+/g, "-")
  const dateSlug = new Date(debrief.created_at).toISOString().slice(0, 10)
  const filename = `debrief-${slug}-${stageSlug}-${dateSlug}.md`

  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
