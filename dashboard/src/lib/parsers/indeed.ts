import type { Job } from "@/types"

export function parseIndeedResults(text: string): Omit<Job, "profileId" | "profileLabel">[] {
  // Try JSON parsing first (more reliable when model returns structured data)
  const jsonJobs = tryParseIndeedJson(text)
  if (jsonJobs.length > 0) return jsonJobs

  // Fall back to markdown parsing
  const jobs: Omit<Job, "profileId" | "profileLabel">[] = []
  const blocks = text.split(/\*\*Job Title:\*\*/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const title = block.split("\n")[0]?.trim()
    if (!title) continue

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
