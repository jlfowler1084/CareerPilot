import type { Job } from "@/types"

export function parseDiceResults(text: string): Omit<Job, "profileId" | "profileLabel">[] {
  const jobs: Omit<Job, "profileId" | "profileLabel">[] = []

  try {
    const jsonMatch = text.match(/\{[\s\S]*"data"\s*:\s*\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0] + (jsonMatch[0].endsWith("}") ? "" : "}"))
      if (parsed.data && Array.isArray(parsed.data)) {
        for (const job of parsed.data) {
          jobs.push({
            title: job.title || "",
            company: job.companyName || "Unknown",
            location: job.jobLocation?.displayName || (job.isRemote ? "Remote" : ""),
            salary: job.salary || "Not listed",
            url: job.detailsPageUrl || "",
            posted: job.postedDate ? new Date(job.postedDate).toLocaleDateString() : "",
            type: job.employmentType || "",
            source: "Dice",
            easyApply: job.easyApply || false,
          })
        }
        return jobs
      }
    }
  } catch {
    // Fall through to line-by-line fallback
  }

  // Fallback: line-by-line regex extraction
  try {
    const lines = text.split("\n")
    let current: Record<string, string> = {}
    for (const line of lines) {
      const titleMatch = line.match(/"title"\s*:\s*"([^"]+)"/)
      if (titleMatch) current.title = titleMatch[1]
      const companyMatch = line.match(/"companyName"\s*:\s*"([^"]+)"/)
      if (companyMatch) current.company = companyMatch[1]
      const urlMatch = line.match(/"detailsPageUrl"\s*:\s*"([^"]+)"/)
      if (urlMatch) {
        current.url = urlMatch[1]
        if (current.title) {
          jobs.push({
            title: current.title,
            company: current.company || "Unknown",
            location: "",
            salary: "Not listed",
            url: current.url,
            posted: "",
            type: "",
            source: "Dice",
          })
        }
        current = {}
      }
    }
  } catch {
    // Return whatever we have
  }

  return jobs
}
