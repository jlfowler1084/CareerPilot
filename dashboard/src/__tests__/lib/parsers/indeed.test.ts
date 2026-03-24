import { describe, it, expect } from "vitest"
import { parseIndeedResults } from "@/lib/parsers/indeed"

describe("parseIndeedResults", () => {
  it("parses markdown-formatted Indeed results", () => {
    const text = `**Job Title:** Systems Administrator
**Company:** Acme Corp
**Location:** Indianapolis, IN
**Compensation:** $80,000 - $100,000
**View Job URL:** https://indeed.com/job/123
**Posted on:** 2026-03-20
**Job Type:** Full-time

**Job Title:** DevOps Engineer
**Company:** TechCo
**Location:** Remote
**Compensation:** Not listed
**View Job URL:** https://indeed.com/job/456
**Posted on:** 2026-03-21
**Job Type:** Contract`

    const jobs = parseIndeedResults(text)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].title).toBe("Systems Administrator")
    expect(jobs[0].company).toBe("Acme Corp")
    expect(jobs[0].location).toBe("Indianapolis, IN")
    expect(jobs[0].salary).toBe("$80,000 - $100,000")
    expect(jobs[0].url).toBe("https://indeed.com/job/123")
    expect(jobs[0].source).toBe("Indeed")
    expect(jobs[1].title).toBe("DevOps Engineer")
    expect(jobs[1].salary).toBe("Not listed")
  })

  it("returns empty array for empty input", () => {
    expect(parseIndeedResults("")).toEqual([])
  })

  it("handles partial fields gracefully", () => {
    const text = `**Job Title:** Partial Job
**Company:** SomeCo`
    const jobs = parseIndeedResults(text)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe("Partial Job")
    expect(jobs[0].location).toBe("")
  })
})
