import { describe, it, expect } from "vitest"
import { shouldAutoCreateContact } from "@/lib/contacts/auto-create-gate"

const USER_EMAIL = "joe@example.com"
const REPLIED_AT = "2026-04-25T10:00:00Z"

describe("shouldAutoCreateContact", () => {
  it("allows a real recruiter with replied_at set", () => {
    const result = shouldAutoCreateContact(
      { from_email: "recruiter@acmecorp.com", from_name: "Jane Smith", replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("rejects when from_email is null", () => {
    const result = shouldAutoCreateContact(
      { from_email: null, from_name: "Someone", replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects when from_email is empty string", () => {
    const result = shouldAutoCreateContact(
      { from_email: "", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects when sender is the user themselves (exact match)", () => {
    const result = shouldAutoCreateContact(
      { from_email: USER_EMAIL, from_name: "Joe", replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects when sender is the user themselves (case-insensitive)", () => {
    const result = shouldAutoCreateContact(
      { from_email: "JOE@EXAMPLE.COM", from_name: "Joe", replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects donotreply local part", () => {
    const result = shouldAutoCreateContact(
      { from_email: "donotreply@somecompany.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects noreply local part", () => {
    const result = shouldAutoCreateContact(
      { from_email: "noreply@somecompany.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects no-reply local part", () => {
    const result = shouldAutoCreateContact(
      { from_email: "no-reply@somecompany.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects hit-reply local part", () => {
    const result = shouldAutoCreateContact(
      { from_email: "hit-reply@someservice.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects inmail-hit-reply local part", () => {
    const result = shouldAutoCreateContact(
      { from_email: "inmail-hit-reply@linkedin.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects bounce local part", () => {
    const result = shouldAutoCreateContact(
      { from_email: "bounce@mailer.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects linkedin.com domain", () => {
    const result = shouldAutoCreateContact(
      { from_email: "hit-reply@linkedin.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects match.indeed.com domain", () => {
    const result = shouldAutoCreateContact(
      { from_email: "jobs@match.indeed.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects subdomain of linkedin.com", () => {
    const result = shouldAutoCreateContact(
      { from_email: "recruiter@mail.linkedin.com", from_name: null, replied_at: REPLIED_AT },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("rejects when replied_at is null", () => {
    const result = shouldAutoCreateContact(
      { from_email: "recruiter@acmecorp.com", from_name: "Jane Smith", replied_at: null },
      USER_EMAIL
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it("every rejection includes a non-empty reason string", () => {
    const rejections = [
      shouldAutoCreateContact({ from_email: null, from_name: null, replied_at: null }, USER_EMAIL),
      shouldAutoCreateContact({ from_email: USER_EMAIL, from_name: null, replied_at: REPLIED_AT }, USER_EMAIL),
      shouldAutoCreateContact({ from_email: "donotreply@x.com", from_name: null, replied_at: REPLIED_AT }, USER_EMAIL),
      shouldAutoCreateContact({ from_email: "noreply@x.com", from_name: null, replied_at: REPLIED_AT }, USER_EMAIL),
      shouldAutoCreateContact({ from_email: "hit-reply@linkedin.com", from_name: null, replied_at: REPLIED_AT }, USER_EMAIL),
      shouldAutoCreateContact({ from_email: "jobs@match.indeed.com", from_name: null, replied_at: REPLIED_AT }, USER_EMAIL),
      shouldAutoCreateContact({ from_email: "recruiter@acmecorp.com", from_name: null, replied_at: null }, USER_EMAIL),
    ]
    for (const r of rejections) {
      expect(r.allow).toBe(false)
      expect(typeof r.reason).toBe("string")
      expect((r.reason as string).length).toBeGreaterThan(0)
    }
  })
})
