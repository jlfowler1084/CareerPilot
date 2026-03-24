import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusBadge } from "@/components/shared/status-badge"

describe("StatusBadge", () => {
  it("renders the correct label for each status", () => {
    const { rerender } = render(<StatusBadge status="applied" />)
    expect(screen.getByText("Applied")).toBeTruthy()

    rerender(<StatusBadge status="ghosted" />)
    expect(screen.getByText("Ghosted")).toBeTruthy()

    rerender(<StatusBadge status="interested" />)
    expect(screen.getByText("Interested")).toBeTruthy()
  })
})
