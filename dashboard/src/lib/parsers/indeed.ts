import type { Job } from "@/types"

type ParsedJob = Omit<Job, "profileId" | "profileLabel">

/** Reject titles that are clearly AI commentary, not real job titles */
function isCommentary(title: string): boolean {
  if (title.length > 80) return true
  const lower = title.toLowerCase()
  return (
    lower.startsWith("i can see") ||
    lower.startsWith("i found") ||
    lower.startsWith("the search") ||
    lower.startsWith("let me") ||
    lower.startsWith("here are") ||
    lower.startsWith("based on") ||
    lower.includes("search results") ||
    lower.includes("job listings") ||
    lower.includes("more specific") ||
    lower.includes("detailed information") ||
    lower.includes("unfortunately")
  )
}

export function parseIndeedResults(text: string): ParsedJob[] {
  // Try JSON parsing first (more reliable when model returns structured data)
  const jsonJobs = tryParseIndeedJson(text).filter((j) => !isCommentary(j.title))
  if (jsonJobs.length > 0) return jsonJobs

  // Fall back to markdown parsing
  const jobs: ParsedJob[] = []
  const blocks = text.split(/\*\*Job Title:\*\*/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const title = block.split("\n")[0]?.trim()
    if (!title || isCommentary(title)) continue

    const companyMatch = block.match(/\*\*Company:\*\*\s*(.+)/)
    const locationMatch = block.match(/\*\*Location:\*\*\s*(.+)/)
    const salaryMatch = block.match(/\*\*Compensation:\*\*\s*(.+)/)
    const urlMatch = block.match(/\*\*View Job URL:\*\*\s*(https?:\/\/[^\s]+)/)
    const postedMatch = block.match(/\*\*Posted on:\*\*\s*(.+)/)
    const typeMatch = block.match(/\*\*Job Type:\*\*\s*(.+)/)

    jobs.push({
      title,
      company: companyMatch?.[1]?.trim() || "Unknown",
      location: locationMatch?.[1]?.trim() || "",
      salary: salaryMatch?.[1]?.trim() || "Not listed",
      url: urlMatch?.[1]?.trim() || "",
      posted: postedMatch?.[1]?.trim() || "",
      type: typeMatch?.[1]?.trim() || "",
      source: "Indeed",
    })
  }

  // Fallback: extract "Title at Company" or "Title - Company" patterns from unstructured text
  if (jobs.length === 0) {
    const lines = text.split("\n")
    for (const line of lines) {
      const trimmed = line.replace(/^[-*•]\s*/, "").trim()
      if (!trimmed || isCommentary(trimmed)) continue

      const atMatch = trimmed.match(/^(.{10,60})\s+at\s+(.{3,40})$/i)
      const dashMatch = trimmed.match(/^(.{10,60})\s*[-–—]\s*(.{3,40})$/i)

      if (atMatch && !isCommentary(atMatch[1])) {
        jobs.push({
          title: atMatch[1].trim(), company: atMatch[2].trim(),
          location: "", salary: "Not listed", url: "", posted: "", type: "", source: "Indeed",
        })
      } else if (dashMatch && !isCommentary(dashMatch[1])) {
        jobs.push({
          title: dashMatch[1].trim(), company: dashMatch[2].trim(),
          location: "", salary: "Not listed", url: "", posted: "", type: "", source: "Indeed",
        })
      }
    }
  }

  return jobs
}

function tryParseIndeedJson(text: string): Omit<Job, "profileId" | "profileLabel">[] {
  const jobs: Omit<Job, "profileId" | "profileLabel">[] = []

  const patterns = [
    /\{[\s\S]*"(?:data|results|jobs)"\s*:\s*\[[\s\S]*\]/,
    /\[[\s\S]*\{[\s\S]*"title"[\s\S]*\}[\s\S]*\]/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue

    try {
      let raw = match[0]
      if (!raw.endsWith("}") && !raw.endsWith("]")) {
        raw += raw.startsWith("[") ? "]" : "}"
      }
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed)
        ? parsed
        : parsed.data || parsed.results || parsed.jobs || []

      if (!Array.isArray(items) || items.length === 0) continue

      for (const item of items) {
        if (!item.title && !item.jobTitle) continue
        jobs.push({
          title: item.title || item.jobTitle || "",
          company: item.company || item.companyName || item.employer || "Unknown",
          location: item.location || item.jobLocation || item.formattedLocation || "",
          salary: item.salary || item.compensation || item.salaryRange || "Not listed",
          url: item.url || item.viewJobUrl || item.jobUrl || item.link || "",
          posted: item.posted || item.postedDate || item.datePosted || "",
          type: item.type || item.jobType || item.employmentType || "",
          source: "Indeed",
        })
      }
      if (jobs.length > 0) return jobs
    } catch {
      continue
    }
  }

  return jobs
}
