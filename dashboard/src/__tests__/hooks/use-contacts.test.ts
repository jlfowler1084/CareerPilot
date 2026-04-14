import { describe, it, expect } from "vitest"
import { buildContactsQuery } from "@/lib/contacts/query"

describe("buildContactsQuery", () => {
  it("returns empty string when no options are set", () => {
    expect(buildContactsQuery({})).toBe("")
  })

  it("drops empty-string filters", () => {
    expect(buildContactsQuery({ search: "", role: "", recency: "" })).toBe("")
  })

  it("includes search when present", () => {
    expect(buildContactsQuery({ search: "perez" })).toBe("search=perez")
  })

  it("includes role when present", () => {
    expect(buildContactsQuery({ role: "recruiter" })).toBe("role=recruiter")
  })

  it("includes recency when present", () => {
    expect(buildContactsQuery({ recency: "active" })).toBe("recency=active")
  })

  it("combines multiple filters in stable key order", () => {
    // URLSearchParams preserves insertion order: search, role, recency
    const qs = buildContactsQuery({
      search: "perez",
      role: "recruiter",
      recency: "active",
    })
    expect(qs).toBe("search=perez&role=recruiter&recency=active")
  })

  it("URL-encodes special characters in search", () => {
    const qs = buildContactsQuery({ search: "first last" })
    expect(qs).toBe("search=first+last")
  })

  it("URL-encodes ampersands in search values", () => {
    const qs = buildContactsQuery({ search: "A&B Corp" })
    // '&' in search must be encoded so it doesn't split into a new query param
    expect(qs).toBe("search=A%26B+Corp")
    // Round-trip sanity: parsing back gives the original value
    const parsed = new URLSearchParams(qs)
    expect(parsed.get("search")).toBe("A&B Corp")
  })

  it("treats a whitespace-only search as present (matches hook contract)", () => {
    // The hook passes truthy strings through; callers are expected to trim
    // upstream if needed. This test locks in that behavior.
    const qs = buildContactsQuery({ search: " " })
    expect(qs).toBe("search=+")
  })

  it("skips undefined options", () => {
    const qs = buildContactsQuery({
      search: undefined,
      role: "recruiter",
      recency: undefined,
    })
    expect(qs).toBe("role=recruiter")
  })
})
