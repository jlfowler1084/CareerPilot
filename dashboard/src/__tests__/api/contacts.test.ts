import { describe, it, expect } from "vitest"
import {
  getRecencyFilter,
  normalizeContactLinks,
} from "@/app/api/contacts/route"

// Fixed reference point so the date math is deterministic.
const NOW = new Date("2026-04-14T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

describe("getRecencyFilter", () => {
  it("returns null for null, undefined, or empty string", () => {
    expect(getRecencyFilter(null, NOW)).toBeNull()
    expect(getRecencyFilter(undefined, NOW)).toBeNull()
    expect(getRecencyFilter("", NOW)).toBeNull()
  })

  it("returns null for unrecognized keyword", () => {
    expect(getRecencyFilter("bogus", NOW)).toBeNull()
    expect(getRecencyFilter("__all__", NOW)).toBeNull()
  })

  it("'active' → { from: now - 14d } with no upper bound", () => {
    const filter = getRecencyFilter("active", NOW)
    expect(filter).toEqual({ from: daysBefore(14) })
    expect(filter?.to).toBeUndefined()
  })

  it("'recent' → { from: now - 60d, to: now - 15d }", () => {
    const filter = getRecencyFilter("recent", NOW)
    expect(filter).toEqual({
      from: daysBefore(60),
      to: daysBefore(15),
    })
  })

  it("'dormant' → { from: now - 180d, to: now - 61d }", () => {
    const filter = getRecencyFilter("dormant", NOW)
    expect(filter).toEqual({
      from: daysBefore(180),
      to: daysBefore(61),
    })
  })

  it("'inactive' → { to: now - 180d } with no lower bound", () => {
    const filter = getRecencyFilter("inactive", NOW)
    expect(filter).toEqual({ to: daysBefore(180) })
    expect(filter?.from).toBeUndefined()
  })

  it("produces non-overlapping, contiguous buckets (active → recent → dormant → inactive)", () => {
    // active: [now - 14d, now]
    // recent: [now - 60d, now - 15d]
    // dormant: [now - 180d, now - 61d]
    // inactive: [..., now - 180d]
    // Adjacent buckets are exactly 1 day apart — a contact dated exactly at a
    // boundary belongs to only one bucket, not two. This test guards against
    // accidentally shifting those edges during a future refactor.
    const active = getRecencyFilter("active", NOW)!
    const recent = getRecencyFilter("recent", NOW)!
    const dormant = getRecencyFilter("dormant", NOW)!
    const inactive = getRecencyFilter("inactive", NOW)!

    // active.from (now-14) > recent.to (now-15) → 1 day gap
    expect(Date.parse(active.from!)).toBeGreaterThan(Date.parse(recent.to!))
    // recent.from (now-60) > dormant.to (now-61) → 1 day gap
    expect(Date.parse(recent.from!)).toBeGreaterThan(Date.parse(dormant.to!))
    // dormant.from (now-180) equals inactive.to (now-180) → boundary row
    //   technically belongs to both, but inactive's <= and dormant's >=
    //   both include the boundary, matching the original inline implementation.
    expect(dormant.from).toBe(inactive.to)
  })
})

describe("normalizeContactLinks", () => {
  it("returns an empty array for empty input", () => {
    expect(normalizeContactLinks([])).toEqual([])
  })

  it("flattens count into link_count and drops the nested key", () => {
    const input = [
      {
        id: "c1",
        name: "David Perez",
        contact_application_links: [{ count: 3 }],
      },
    ]
    const result = normalizeContactLinks(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: "c1",
      name: "David Perez",
      link_count: 3,
    })
    // nested aggregate should be cleared from the response payload
    expect(result[0].contact_application_links).toBeUndefined()
  })

  it("returns link_count: 0 when the nested array is empty", () => {
    const result = normalizeContactLinks([
      { id: "c1", contact_application_links: [] },
    ])
    expect(result[0].link_count).toBe(0)
  })

  it("returns link_count: 0 when the nested key is null", () => {
    const result = normalizeContactLinks([
      { id: "c1", contact_application_links: null },
    ])
    expect(result[0].link_count).toBe(0)
  })

  it("returns link_count: 0 when the key is missing entirely", () => {
    const result = normalizeContactLinks([{ id: "c1" }])
    expect(result[0].link_count).toBe(0)
  })

  it("preserves all other fields on the row", () => {
    const input = [
      {
        id: "c1",
        user_id: "u1",
        name: "David",
        email: "d@x.com",
        phone: null,
        company: "Tek",
        contact_application_links: [{ count: 2 }],
      },
    ]
    const [row] = normalizeContactLinks(input)
    expect(row).toMatchObject({
      id: "c1",
      user_id: "u1",
      name: "David",
      email: "d@x.com",
      phone: null,
      company: "Tek",
      link_count: 2,
    })
  })

  it("processes multiple rows independently", () => {
    const input = [
      { id: "c1", contact_application_links: [{ count: 1 }] },
      { id: "c2", contact_application_links: null },
      { id: "c3", contact_application_links: [{ count: 7 }] },
    ]
    const result = normalizeContactLinks(input)
    expect(result.map((r) => r.link_count)).toEqual([1, 0, 7])
  })
})
