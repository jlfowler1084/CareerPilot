import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { useDebriefStats } from "@/hooks/use-debrief-stats"

// Use vi.hoisted so these refs are available when vi.mock factory runs (hoisted before imports)
const { mockSubscribe, mockOn, mockChannel, mockRemoveChannel } = vi.hoisted(() => {
  const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
  const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe })
  const mockChannel = vi.fn().mockReturnValue({ on: mockOn })
  const mockRemoveChannel = vi.fn()
  return { mockSubscribe, mockOn, mockChannel, mockRemoveChannel }
})

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}))

const MOCK_STATS = {
  total_debriefs: 5,
  average_rating: 3.8,
  most_recent_at: "2026-04-06T15:30:00Z",
  debriefs_this_week: 2,
}

describe("useDebriefStats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts in loading state", () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})) // Never resolves
    const { result } = renderHook(() => useDebriefStats())
    expect(result.current.loading).toBe(true)
    expect(result.current.stats).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it("fetches stats on mount", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_STATS,
    })

    const { result } = renderHook(() => useDebriefStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toEqual(MOCK_STATS)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/debriefs/stats",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("sets error on fetch failure", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    })

    const { result } = renderHook(() => useDebriefStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe("Unauthorized")
    expect(result.current.stats).toBeNull()
  })

  it("cleans up channel on unmount", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_STATS,
    })

    const { unmount } = renderHook(() => useDebriefStats())
    unmount()

    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it("refresh triggers a new fetch", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_STATS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...MOCK_STATS, total_debriefs: 6 }) })

    const { result } = renderHook(() => useDebriefStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.stats?.total_debriefs).toBe(6)
    })
  })
})
