import { describe, it, expect } from "vitest"
import {
  validateContactEmail,
  sanitizeContactName,
  validateContactInput,
} from "@/lib/contacts/validation"

describe("validateContactEmail", () => {
  it("accepts common valid addresses", () => {
    expect(validateContactEmail("dperez@teksystems.com")).toBe(true)
    expect(validateContactEmail("a.b+tag@example.co.uk")).toBe(true)
    expect(validateContactEmail("user_name-1@sub.domain.io")).toBe(true)
  })

  it("rejects missing @", () => {
    expect(validateContactEmail("plainaddress")).toBe(false)
  })

  it("rejects missing domain dot", () => {
    expect(validateContactEmail("user@localhost")).toBe(false)
  })

  it("rejects whitespace in local or domain", () => {
    expect(validateContactEmail("user name@example.com")).toBe(false)
    expect(validateContactEmail("user@exa mple.com")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(validateContactEmail("")).toBe(false)
  })
})

describe("sanitizeContactName", () => {
  it("returns plain names unchanged", () => {
    expect(sanitizeContactName("David Perez")).toBe("David Perez")
  })

  it("trims surrounding whitespace", () => {
    expect(sanitizeContactName("   Jane Doe   ")).toBe("Jane Doe")
  })

  it("strips simple HTML tags", () => {
    expect(sanitizeContactName("<b>Bold</b> Name")).toBe("Bold Name")
  })

  it("strips nested and self-closing tags", () => {
    expect(sanitizeContactName("<div><span>Alice</span></div>")).toBe("Alice")
    expect(sanitizeContactName("Bob<br/>Smith")).toBe("BobSmith")
  })

  it("strips script-tag attempts (XSS seed)", () => {
    const result = sanitizeContactName('<script>alert("xss")</script>Evil')
    expect(result).toBe('alert("xss")Evil')
    expect(result).not.toContain("<script>")
  })

  it("enforces 255-char length cap", () => {
    const long = "a".repeat(500)
    expect(sanitizeContactName(long).length).toBe(255)
  })

  it("caps length AFTER tag stripping", () => {
    // 260 'a' chars wrapped in tags should still cap at 255
    const padded = "<b>" + "a".repeat(260) + "</b>"
    const result = sanitizeContactName(padded)
    expect(result.length).toBe(255)
    expect(result).not.toContain("<")
  })
})

describe("validateContactInput", () => {
  it("accepts a name-only input", () => {
    const result = validateContactInput({ name: "David Perez" })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("accepts a name + valid email input", () => {
    const result = validateContactInput({
      name: "David Perez",
      email: "dperez@teksystems.com",
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("rejects missing name", () => {
    const result = validateContactInput({ email: "a@b.co" })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Name is required")
  })

  it("rejects empty-string name", () => {
    const result = validateContactInput({ name: "", email: "a@b.co" })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Name is required")
  })

  it("rejects whitespace-only name", () => {
    const result = validateContactInput({ name: "   ", email: "a@b.co" })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Name is required")
  })

  it("rejects invalid email with valid name", () => {
    const result = validateContactInput({ name: "Jane", email: "not-an-email" })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Invalid email format")
  })

  it("accepts missing or null email (email is optional)", () => {
    expect(validateContactInput({ name: "Jane" }).valid).toBe(true)
    expect(validateContactInput({ name: "Jane", email: null }).valid).toBe(true)
  })

  it("accepts empty string email as equivalent to no email", () => {
    // Because `input.email && validateContactEmail(...)` short-circuits on ""
    const result = validateContactInput({ name: "Jane", email: "" })
    expect(result.valid).toBe(true)
  })

  it("reports multiple errors together", () => {
    const result = validateContactInput({ name: "", email: "bogus" })
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors).toContain("Name is required")
    expect(result.errors).toContain("Invalid email format")
  })
})
