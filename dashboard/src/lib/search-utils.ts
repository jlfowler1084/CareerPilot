import type { Job } from "@/types"
import { IRRELEVANT_KEYWORDS } from "@/lib/constants"

function jobKey(job: Pick<Job, "title" | "company">): string {
  return `${job.title}|||${job.company}`.toLowerCase()
}

export function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>()
  return jobs.filter((job) => {
    const key = jobKey(job)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function filterIrrelevant(jobs: Job[]): Job[] {
  return jobs.filter((job) => {
    const titleLower = job.title.toLowerCase()
    return !IRRELEVANT_KEYWORDS.some((kw) => titleLower.includes(kw))
  })
}

export function deduplicateAgainstCache(
  newJobs: Job[],
  cachedJobs: Pick<Job, "title" | "company">[]
): { new: Job[]; seen: Job[] } {
  const cachedKeys = new Set(cachedJobs.map(jobKey))
  const result: { new: Job[]; seen: Job[] } = { new: [], seen: [] }

  for (const job of newJobs) {
    if (cachedKeys.has(jobKey(job))) {
      result.seen.push(job)
    } else {
      result.new.push(job)
    }
  }

  return result
}
