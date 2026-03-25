import { describe, it, expect } from "vitest"
import { extractSecondLevelDomain, findDomainMatch } from "@/lib/gmail/suggestions"

describe("extractSecondLevelDomain", () => {
  it("extracts SLD from standard domain", () => {
    expect(extractSecondLevelDomain("cummins.com")).toBe("cummins")
  })

  it("handles subdomains", () => {
    expect(extractSecondLevelDomain("mail.cummins.com")).toBe("cummins")
  })

  it("returns null for null input", () => {
    expect(extractSecondLevelDomain(null)).toBeNull()
  })
})

describe("findDomainMatch", () => {
  const applications = [
    { id: "app-1", company: "Cummins Inc.", status: "applied" },
    { id: "app-2", company: "Eli Lilly and Company", status: "interested" },
    { id: "app-3", company: "TekSystems", status: "applied" },
  ]

  it("matches domain to single application", () => {
    expect(findDomainMatch("cummins.com", applications)).toBe("app-1")
  })

  it("returns null for no match", () => {
    expect(findDomainMatch("google.com", applications)).toBeNull()
  })

  it("returns null for multiple matches (ambiguous)", () => {
    const dupes = [
      { id: "app-1", company: "Cummins Engines", status: "applied" },
      { id: "app-2", company: "Cummins Power", status: "interview" },
    ]
    expect(findDomainMatch("cummins.com", dupes)).toBeNull()
  })

  it("handles staffing agency domains (no match expected)", () => {
    expect(findDomainMatch("teksystems.com", applications)).toBe("app-3")
  })
})
