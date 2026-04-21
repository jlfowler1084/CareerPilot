/**
 * Tests for dashboard/src/lib/url-dedup.ts (CAR-167).
 */

import { describe, expect, it } from "vitest"
import type { Application } from "@/types"
import {
  findApplicationByUrl,
  formatDuplicateConfirmMessage,
} from "./url-dedup"

// Minimal Application factory — only the fields the dedup cares about
function makeApp(overrides: Partial<Application>): Application {
  return {
    id: "test-id",
    user_id: "test-user",
    title: "Test",
    company: "Test Co",
    status: "found",
    url: null,
    location: null,
    source: null,
    salary_range: null,
    job_type: null,
    posted_date: null,
    date_found: null,
    date_applied: null,
    date_response: null,
    notes: null,
    profile_id: null,
    updated_at: null,
    tailored_resume: null,
    interview_date: null,
    follow_up_date: null,
    calendar_event_id: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_role: null,
    job_description: null,
    interview_prep: null,
    cover_letter: null,
    ...overrides,
  } as Application
}

describe("findApplicationByUrl", () => {
  it("returns null for empty url", () => {
    expect(findApplicationByUrl("", [makeApp({ url: "https://a.com" })])).toBeNull()
  })

  it("returns null for whitespace-only url", () => {
    expect(findApplicationByUrl("   ", [makeApp({ url: "https://a.com" })])).toBeNull()
  })

  it("returns null for null url", () => {
    expect(findApplicationByUrl(null, [makeApp({ url: "https://a.com" })])).toBeNull()
  })

  it("returns null when no application matches", () => {
    const apps = [
      makeApp({ url: "https://a.com", title: "A" }),
      makeApp({ url: "https://b.com", title: "B" }),
    ]
    expect(findApplicationByUrl("https://c.com", apps)).toBeNull()
  })

  it("returns the matching application when url matches", () => {
    const apps = [
      makeApp({ id: "a-id", url: "https://a.com", title: "A" }),
      makeApp({ id: "b-id", url: "https://b.com", title: "B" }),
    ]
    const result = findApplicationByUrl("https://b.com", apps)
    expect(result).not.toBeNull()
    expect(result?.id).toBe("b-id")
  })

  it("trims whitespace on the lookup value", () => {
    const apps = [makeApp({ url: "https://a.com", title: "A" })]
    expect(findApplicationByUrl("  https://a.com  ", apps)?.title).toBe("A")
  })

  it("ignores applications with null or empty url", () => {
    const apps = [
      makeApp({ url: null, title: "No URL" }),
      makeApp({ url: "", title: "Empty URL" }),
      makeApp({ url: "https://a.com", title: "Has URL" }),
    ]
    const result = findApplicationByUrl("https://a.com", apps)
    expect(result?.title).toBe("Has URL")
  })

  it("returns the first match when multiple apps share a url", () => {
    // Data-integrity concern (should be caught by upstream), but function
    // shouldn't crash.
    const apps = [
      makeApp({ id: "first", url: "https://dup.com" }),
      makeApp({ id: "second", url: "https://dup.com" }),
    ]
    expect(findApplicationByUrl("https://dup.com", apps)?.id).toBe("first")
  })
})

describe("formatDuplicateConfirmMessage", () => {
  it("includes title, company, and status", () => {
    const app = makeApp({
      title: "Systems Engineer",
      company: "Acme Corp",
      status: "applied",
    })
    const msg = formatDuplicateConfirmMessage(app)
    expect(msg).toContain("Systems Engineer")
    expect(msg).toContain("Acme Corp")
    expect(msg).toContain("applied")
    expect(msg).toContain("Add a duplicate anyway?")
  })

  it("handles missing status gracefully", () => {
    const app = makeApp({
      title: "A",
      company: "B",
      status: "" as Application["status"],
    })
    const msg = formatDuplicateConfirmMessage(app)
    expect(msg).toContain("A at B")
    expect(msg).not.toContain("(status:")
  })
})
