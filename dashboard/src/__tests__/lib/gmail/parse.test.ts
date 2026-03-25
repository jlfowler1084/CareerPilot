import { describe, it, expect } from "vitest"
import { extractBody, extractDomain } from "@/lib/gmail/parse"

describe("extractBody", () => {
  it("returns plain text from text/plain part", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: Buffer.from("Hello world").toString("base64url") },
      parts: undefined,
    }
    expect(extractBody(payload)).toBe("Hello world")
  })

  it("prefers text/plain over text/html in multipart", () => {
    const payload = {
      mimeType: "multipart/alternative",
      body: { data: undefined },
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("Plain text").toString("base64url") },
        },
        {
          mimeType: "text/html",
          body: { data: Buffer.from("<p>HTML</p>").toString("base64url") },
        },
      ],
    }
    expect(extractBody(payload)).toBe("Plain text")
  })

  it("strips HTML tags when only text/html available", () => {
    const payload = {
      mimeType: "text/html",
      body: { data: Buffer.from("<p>Hello <b>world</b></p>").toString("base64url") },
      parts: undefined,
    }
    expect(extractBody(payload)).toBe("Hello world")
  })

  it("returns empty string for missing body data", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: undefined },
      parts: undefined,
    }
    expect(extractBody(payload)).toBe("")
  })
})

describe("extractDomain", () => {
  it("extracts domain from email address", () => {
    expect(extractDomain("sarah@cummins.com")).toBe("cummins.com")
  })

  it("handles angle-bracket format", () => {
    expect(extractDomain("Sarah Williams <sarah@cummins.com>")).toBe("cummins.com")
  })

  it("returns null for invalid input", () => {
    expect(extractDomain("no-at-sign")).toBeNull()
  })
})
