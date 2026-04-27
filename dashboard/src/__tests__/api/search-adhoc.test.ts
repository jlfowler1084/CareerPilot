import { describe, it, expect, vi, beforeEach } from "vitest"
import { isRateLimitError } from "@/app/api/search-adhoc/route"
import { parseDiceResults } from "@/lib/parsers/dice"

// ── isRateLimitError unit tests ────────────────────────────────────────────

describe("isRateLimitError", () => {
  it("returns true for 'rate limit' message", () => {
    expect(isRateLimitError("Dice MCP error: rate limit exceeded")).toBe(true)
  })

  it("returns true for 'too many requests' message", () => {
    expect(isRateLimitError("Dice MCP error: too many requests")).toBe(true)
  })

  it("returns true for '429' in message", () => {
    expect(isRateLimitError("HTTP 429 from upstream")).toBe(true)
  })

  it("returns true for 'throttl' substring (throttled, throttling)", () => {
    expect(isRateLimitError("Request throttled by upstream")).toBe(true)
    expect(isRateLimitError("Dice MCP throttling applied")).toBe(true)
  })

  it("returns false for generic MCP errors", () => {
    expect(isRateLimitError("Dice MCP error: connection timeout")).toBe(false)
    expect(isRateLimitError("Network error")).toBe(false)
  })

  it("is case-insensitive", () => {
    expect(isRateLimitError("Rate Limit Exceeded")).toBe(true)
    expect(isRateLimitError("TOO MANY REQUESTS")).toBe(true)
  })
})

// ── parseDiceResults unit tests ────────────────────────────────────────────

const SAMPLE_DICE_PAYLOAD = JSON.stringify({
  data: [
    {
      title: "PowerShell Engineer",
      companyName: "Acme Corp",
      jobLocation: { displayName: "Indianapolis, IN" },
      salary: "$120k-$140k",
      detailsPageUrl: "https://dice.com/jobs/123",
      postedDate: "2026-04-27T00:00:00Z",
      employmentType: "FULLTIME",
      easyApply: true,
    },
    {
      title: "DevOps Specialist",
      companyName: "BigCo",
      isRemote: true,
      salary: null,
      detailsPageUrl: "https://dice.com/jobs/456",
      postedDate: null,
      employmentType: "CONTRACTS",
      easyApply: false,
    },
  ],
})

describe("parseDiceResults", () => {
  it("parses a well-formed Dice MCP payload into jobs", () => {
    const jobs = parseDiceResults(SAMPLE_DICE_PAYLOAD)
    expect(jobs).toHaveLength(2)
  })

  it("maps title and company correctly", () => {
    const [j1] = parseDiceResults(SAMPLE_DICE_PAYLOAD)
    expect(j1.title).toBe("PowerShell Engineer")
    expect(j1.company).toBe("Acme Corp")
  })

  it("uses isRemote flag when jobLocation is absent", () => {
    const [, j2] = parseDiceResults(SAMPLE_DICE_PAYLOAD)
    expect(j2.location).toBe("Remote")
  })

  it("defaults salary to 'Not listed' when null", () => {
    const [, j2] = parseDiceResults(SAMPLE_DICE_PAYLOAD)
    expect(j2.salary).toBe("Not listed")
  })

  it("sets source to 'Dice' on every result", () => {
    const jobs = parseDiceResults(SAMPLE_DICE_PAYLOAD)
    jobs.forEach((j) => expect(j.source).toBe("Dice"))
  })

  it("maps easyApply correctly", () => {
    const [j1, j2] = parseDiceResults(SAMPLE_DICE_PAYLOAD)
    expect(j1.easyApply).toBe(true)
    expect(j2.easyApply).toBe(false)
  })

  it("returns empty array for empty/invalid text", () => {
    expect(parseDiceResults("")).toHaveLength(0)
    expect(parseDiceResults("not json at all")).toHaveLength(0)
  })
})

// ── Route handler integration test (keyword validation) ───────────────────

vi.mock("@/lib/mcp-client", () => ({
  searchDiceDirect: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
  }),
}))

describe("POST /api/search-adhoc handler", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 400 when keyword is missing", async () => {
    const { POST } = await import("@/app/api/search-adhoc/route")
    const req = new Request("http://localhost/api/search-adhoc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: "Remote" }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/keyword/i)
  })

  it("returns 400 when keyword is empty string", async () => {
    const { POST } = await import("@/app/api/search-adhoc/route")
    const req = new Request("http://localhost/api/search-adhoc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "   " }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it("returns 503 when Dice returns a rate-limit error", async () => {
    const { searchDiceDirect } = await import("@/lib/mcp-client")
    vi.mocked(searchDiceDirect).mockRejectedValue(new Error("Dice MCP error: rate limit exceeded"))

    const { POST } = await import("@/app/api/search-adhoc/route")
    const req = new Request("http://localhost/api/search-adhoc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "PowerShell", location: "Remote" }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toMatch(/rate limit/i)
  })

  it("returns jobs array on success", async () => {
    const { searchDiceDirect } = await import("@/lib/mcp-client")
    vi.mocked(searchDiceDirect).mockResolvedValue(SAMPLE_DICE_PAYLOAD)

    const { POST } = await import("@/app/api/search-adhoc/route")
    const req = new Request("http://localhost/api/search-adhoc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "PowerShell", location: "Indianapolis, IN" }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.jobs).toHaveLength(2)
    expect(json.count).toBe(2)
    expect(json.source).toBe("Dice")
    // Ad-hoc results have profileLabel set
    expect(json.jobs[0].profileLabel).toBe("Ad-hoc")
  })
})
