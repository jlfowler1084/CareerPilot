import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { ResultRow } from "@/components/search/result-row"
import type { JobSearchResultRow } from "@/types/supabase"

function row(over: Partial<JobSearchResultRow> = {}): JobSearchResultRow {
  return {
    id: "row-1",
    user_id: "user-1",
    source: "indeed",
    source_id: "abc",
    url: "https://indeed.com/jobs/abc",
    title: "Systems Engineer",
    company: "Acme Corp",
    location: "Remote",
    salary: "$120k",
    job_type: "Full-time",
    posted_date: "2 days ago",
    easy_apply: false,
    profile_id: "profile-a",
    profile_label: "Profile A",
    description: null,
    requirements: null,
    nice_to_haves: null,
    discovered_at: "2026-04-27T00:00:00Z",
    last_seen_at: "2026-04-27T00:00:00Z",
    last_enriched_at: null,
    status: "new",
    application_id: null,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    ...over,
  }
}

describe("ResultRow", () => {
  it("renders the job title and company", () => {
    const r = row()
    render(
      <ResultRow
        row={r}
        selected={false}
        onSelect={vi.fn()}
        onTrack={vi.fn()}
      />
    )
    expect(screen.getByText("Systems Engineer")).toBeDefined()
    expect(screen.getByText(/Acme Corp/)).toBeDefined()
  })

  it("onTrack handler receives the full JobSearchResultRow, not the lossy Job", () => {
    const r = row()
    const onTrack = vi.fn()
    render(
      <ResultRow
        row={r}
        selected={false}
        onSelect={vi.fn()}
        onTrack={onTrack}
      />
    )
    fireEvent.click(screen.getByText("Track"))
    expect(onTrack).toHaveBeenCalledWith(r)
    // Verify the argument is the row (has id field from JobSearchResultRow)
    expect(onTrack.mock.calls[0][0]).toHaveProperty("id", "row-1")
    expect(onTrack.mock.calls[0][0]).toHaveProperty("source", "indeed")
  })

  it("onSelect called when card is clicked", () => {
    const r = row()
    const onSelect = vi.fn()
    render(
      <ResultRow
        row={r}
        selected={false}
        onSelect={onSelect}
        onTrack={vi.fn()}
      />
    )
    // Click the card container (uses onViewDetails internally)
    const card = screen.getByText("Systems Engineer").closest("[role='button'], div[tabindex='0'], div[onClick]")
    // The JobCard wraps the entire card div; firing click on the title text bubbles up
    fireEvent.click(screen.getByText("Systems Engineer"))
    expect(onSelect).toHaveBeenCalledWith(r)
  })

  it("selected state adds amber ring class", () => {
    const r = row()
    const { container } = render(
      <ResultRow
        row={r}
        selected={true}
        onSelect={vi.fn()}
        onTrack={vi.fn()}
      />
    )
    expect(container.firstChild?.toString()).toBeDefined()
    expect(container.innerHTML).toContain("ring-amber-400")
  })

  it("onTailor handler receives the full row", () => {
    const r = row()
    const onTailor = vi.fn()
    render(
      <ResultRow
        row={r}
        selected={false}
        onSelect={vi.fn()}
        onTrack={vi.fn()}
        onTailor={onTailor}
      />
    )
    fireEvent.click(screen.getByTitle("Tailor resume for this job"))
    expect(onTailor).toHaveBeenCalledWith(r)
  })

  it("onAddToQueue handler receives the full row", () => {
    const r = row()
    const onAddToQueue = vi.fn()
    render(
      <ResultRow
        row={r}
        selected={false}
        onSelect={vi.fn()}
        onTrack={vi.fn()}
        onAddToQueue={onAddToQueue}
      />
    )
    fireEvent.click(screen.getByTitle("Add to auto-apply queue"))
    expect(onAddToQueue).toHaveBeenCalledWith(r)
  })

  it("tracked=true renders 'Tracking' badge instead of Track button", () => {
    const r = row({ application_id: "app-123" })
    render(
      <ResultRow
        row={r}
        selected={false}
        onSelect={vi.fn()}
        onTrack={vi.fn()}
      />
    )
    expect(screen.getByText("Tracking")).toBeDefined()
    expect(screen.queryByText("Track")).toBeNull()
  })
})
