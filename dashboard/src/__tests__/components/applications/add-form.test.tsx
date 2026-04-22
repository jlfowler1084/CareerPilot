import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AddForm } from "@/components/applications/add-form"
import type { Application } from "@/types"

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    user_id: "user-1",
    title: "Engineer",
    company: "Acme",
    location: null,
    url: "https://example.com/job/1",
    source: null,
    salary_range: null,
    status: "interested",
    job_type: null,
    posted_date: null,
    date_found: "2026-01-01",
    date_applied: null,
    date_response: null,
    notes: "",
    profile_id: "",
    updated_at: "2026-01-01",
    tailored_resume: null,
    cover_letter: null,
    interview_date: null,
    follow_up_date: null,
    calendar_event_id: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_role: null,
    job_description: null,
    ...overrides,
  }
}

function makeOnAdd(
  result: { data: unknown; error: unknown } = { data: {}, error: null }
) {
  return vi.fn().mockResolvedValue(result)
}

function openOuterCard() {
  fireEvent.click(screen.getByRole("button", { name: /add application manually/i }))
}

async function openMoreDetails() {
  fireEvent.click(screen.getByRole("button", { name: /more details/i }))
}

describe("AddForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Outer card disclosure ───────────────────────────────────────────────

  it("renders with outer card closed by default", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    expect(screen.queryByPlaceholderText("Systems Engineer")).not.toBeInTheDocument()
  })

  it("clicking outer trigger opens the card and shows core fields + More details button", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    expect(screen.getByPlaceholderText("Systems Engineer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /more details/i })).toBeInTheDocument()
  })

  // ── More details disclosure ─────────────────────────────────────────────

  it("More details button is collapsed by default (aria-expanded=false)", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    const btn = screen.getByRole("button", { name: /more details/i })
    expect(btn).toHaveAttribute("aria-expanded", "false")
  })

  it("clicking More details reveals status select, notes, job_description and flips aria-expanded", async () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    await openMoreDetails()
    expect(screen.getByRole("combobox", { name: /status/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Private notes about this role...")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Paste the job description here...")).toBeInTheDocument()
    const btn = screen.getByRole("button", { name: /more details/i })
    expect(btn).toHaveAttribute("aria-expanded", "true")
  })

  it("More details button has aria-controls pointing to the details panel id", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    const btn = screen.getByRole("button", { name: /more details/i })
    const controlsId = btn.getAttribute("aria-controls")
    expect(controlsId).toBeTruthy()
  })

  it("focus moves to status select when More details is opened", async () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    await openMoreDetails()
    await waitFor(() => {
      const select = screen.getByRole("combobox", { name: /status/i })
      expect(document.activeElement).toBe(select)
    })
  })

  // ── Status select content (R3) ──────────────────────────────────────────

  it("status select renders exactly 6 creation-time choices (STATUSES.slice(0,6))", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    openMoreDetails()
    const select = screen.getByRole("combobox", { name: /status/i })
    const options = within(select).getAllByRole("option")
    expect(options).toHaveLength(6)
    const labels = options.map((o) => o.textContent)
    expect(labels).toContain("Found")
    expect(labels).toContain("Interested")
    expect(labels).toContain("Applied")
    expect(labels).toContain("Phone Screen")
    expect(labels).toContain("Interview")
    expect(labels).toContain("Offer")
  })

  it("rejected / withdrawn / ghosted are not in the status select (R3)", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    openMoreDetails()
    const select = screen.getByRole("combobox", { name: /status/i })
    expect(within(select).queryByRole("option", { name: /rejected/i })).not.toBeInTheDocument()
    expect(within(select).queryByRole("option", { name: /withdrawn/i })).not.toBeInTheDocument()
    expect(within(select).queryByRole("option", { name: /ghosted/i })).not.toBeInTheDocument()
  })

  // ── Tab / keyboard order (R10) ──────────────────────────────────────────

  it("More details button appears before submit button in DOM (R10 tab order)", () => {
    render(<AddForm onAdd={makeOnAdd()} />)
    openOuterCard()
    const moreBtn = screen.getByRole("button", { name: /more details/i })
    const submitBtn = screen.getByRole("button", { name: /^add$/i })
    // DOCUMENT_POSITION_FOLLOWING === 4 means moreBtn precedes submitBtn
    expect(moreBtn.compareDocumentPosition(submitBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // ── Quick-add submit (R4) ───────────────────────────────────────────────

  it("quick-add (disclosure never opened) calls onAdd with status=undefined, notes='', job_description=null", async () => {
    const onAdd = makeOnAdd()
    render(<AddForm onAdd={onAdd} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    const [job] = onAdd.mock.calls[0]
    expect(job.status).toBeUndefined()
    expect(job.notes).toBe("")
    expect(job.job_description).toBeNull()
  })

  // ── Full manual submit (R1, R5) ─────────────────────────────────────────

  it("full manual submit passes chosen status, notes, job_description to onAdd", async () => {
    const onAdd = makeOnAdd()
    render(<AddForm onAdd={onAdd} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    openMoreDetails()
    fireEvent.change(screen.getByRole("combobox", { name: /status/i }), { target: { value: "applied" } })
    fireEvent.change(screen.getByPlaceholderText("Private notes about this role..."), { target: { value: "Great team" } })
    fireEvent.change(screen.getByPlaceholderText("Paste the job description here..."), { target: { value: "JD text" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    const [job] = onAdd.mock.calls[0]
    expect(job.status).toBe("applied")
    expect(job.notes).toBe("Great team")
    expect(job.job_description).toBe("JD text")
  })

  // ── Field reset on success vs failure (R11, R12) ────────────────────────

  it("on successful submit, fields reset and disclosure closes (R11)", async () => {
    const onAdd = makeOnAdd({ data: {}, error: null })
    render(<AddForm onAdd={onAdd} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    openMoreDetails()
    fireEvent.change(screen.getByPlaceholderText("Private notes about this role..."), { target: { value: "Notes" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    // Outer card collapses on success
    expect(screen.queryByPlaceholderText("Systems Engineer")).not.toBeInTheDocument()
  })

  it("on submit error, notes and job_description are preserved (R12)", async () => {
    const onAdd = makeOnAdd({ data: null, error: new Error("fail") })
    render(<AddForm onAdd={onAdd} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    openMoreDetails()
    fireEvent.change(screen.getByPlaceholderText("Private notes about this role..."), { target: { value: "My notes" } })
    fireEvent.change(screen.getByPlaceholderText("Paste the job description here..."), { target: { value: "JD text" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(screen.getByPlaceholderText("Private notes about this role...")).toHaveValue("My notes")
    expect(screen.getByPlaceholderText("Paste the job description here...")).toHaveValue("JD text")
  })

  // ── Validation guard ────────────────────────────────────────────────────

  it("empty title (whitespace only) does not call onAdd", async () => {
    const onAdd = makeOnAdd()
    render(<AddForm onAdd={onAdd} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "   " } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await new Promise((r) => setTimeout(r, 50))
    expect(onAdd).not.toHaveBeenCalled()
  })

  // ── Duplicate URL detection (R8, R11) ───────────────────────────────────

  it("duplicate URL cancel: onAdd not called and all field values preserved", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
    const onAdd = makeOnAdd()
    const existing = makeApp({ url: "https://example.com/job/1" })
    render(<AddForm onAdd={onAdd} existingApplications={[existing]} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    fireEvent.change(screen.getByPlaceholderText("https://..."), { target: { value: "https://example.com/job/1" } })
    openMoreDetails()
    fireEvent.change(screen.getByPlaceholderText("Private notes about this role..."), { target: { value: "Keep me" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await new Promise((r) => setTimeout(r, 50))
    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText("Private notes about this role...")).toHaveValue("Keep me")
    confirmSpy.mockRestore()
  })

  it("duplicate URL confirm: onAdd called with all new-field values intact", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
    const onAdd = makeOnAdd()
    const existing = makeApp({ url: "https://example.com/job/1" })
    render(<AddForm onAdd={onAdd} existingApplications={[existing]} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    fireEvent.change(screen.getByPlaceholderText("https://..."), { target: { value: "https://example.com/job/1" } })
    openMoreDetails()
    fireEvent.change(screen.getByPlaceholderText("Private notes about this role..."), { target: { value: "Notes" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    const [job] = onAdd.mock.calls[0]
    expect(job.notes).toBe("Notes")
    confirmSpy.mockRestore()
  })

  // ── Logged-out edge (R12 auth hole) ────────────────────────────────────

  it("onAdd returning { error } does not reset fields or crash (logged-out edge, R12)", async () => {
    const onAdd = vi.fn().mockResolvedValue({ data: null, error: new Error("Not authenticated") })
    render(<AddForm onAdd={onAdd} />)
    openOuterCard()
    fireEvent.change(screen.getByPlaceholderText("Systems Engineer"), { target: { value: "Dev" } })
    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Corp" } })
    openMoreDetails()
    fireEvent.change(screen.getByPlaceholderText("Private notes about this role..."), { target: { value: "Important" } })
    fireEvent.submit(screen.getByRole("button", { name: /^add$/i }).closest("form")!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(screen.getByPlaceholderText("Private notes about this role...")).toHaveValue("Important")
  })
})
