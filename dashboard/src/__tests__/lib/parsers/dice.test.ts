import { describe, it, expect } from "vitest"
import { parseDiceResults } from "@/lib/parsers/dice"

describe("parseDiceResults", () => {
  it("parses JSON data array format", () => {
    const text = JSON.stringify({
      data: [
        {
          title: "Systems Engineer",
          companyName: "BigCorp",
          jobLocation: { displayName: "Indianapolis, IN" },
          salary: "$90k-$110k",
          detailsPageUrl: "https://dice.com/job/789",
          postedDate: "2026-03-20T00:00:00Z",
          employmentType: "Full-time",
          easyApply: true,
        },
        {
          title: "Cloud Admin",
          companyName: "CloudCo",
          isRemote: true,
          detailsPageUrl: "https://dice.com/job/012",
          employmentType: "Contract",
        },
      ],
    })

    const jobs = parseDiceResults(text)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].title).toBe("Systems Engineer")
    expect(jobs[0].company).toBe("BigCorp")
    expect(jobs[0].location).toBe("Indianapolis, IN")
    expect(jobs[0].easyApply).toBe(true)
    expect(jobs[0].source).toBe("Dice")
    expect(jobs[1].location).toBe("Remote")
  })

  it("returns empty array for unparseable input", () => {
    expect(parseDiceResults("some random text with no json")).toEqual([])
  })
})
