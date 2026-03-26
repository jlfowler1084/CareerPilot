import type { Job } from "@/types"
import { IRRELEVANT_KEYWORDS } from "@/lib/constants"

function jobKey(job: Pick<Job, "title" | "company">): string {
  return `${job.title}|||${job.company}`.toLowerCase()
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s\-—]+/g, " ").trim()
}

export function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>()
  const seenByTitle = new Map<string, number>() // normalized title -> index in result
  const result: Job[] = []

  for (const job of jobs) {
    const key = jobKey(job)
    if (seen.has(key)) continue
    seen.add(key)

    const normTitle = normalizeTitle(job.title)
    const existingIdx = seenByTitle.get(normTitle)

    if (existingIdx !== undefined) {
      const existing = result[existingIdx]
      // Keep the one with a real company name
      if (existing.company.toLowerCase() === "unknown" && job.company.toLowerCase() !== "unknown") {
        result[existingIdx] = job
      }
      // Either way, skip the duplicate title
      continue
    }

    seenByTitle.set(normTitle, result.length)
    result.push(job)
  }

  return result
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
