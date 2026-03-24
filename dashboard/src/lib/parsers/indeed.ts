import type { Job } from "@/types"

export function parseIndeedResults(text: string): Omit<Job, "profileId" | "profileLabel">[] {
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
