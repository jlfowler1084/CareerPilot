import { describe, it, expect } from "vitest"
import { classifyResearch404 } from "@/hooks/use-research"

describe("classifyResearch404", () => {
  it("classifies a missing-research body as 'missing' with slug and hint", () => {
    const result = classifyResearch404({
      found: false,
      slug: "irving_materials",
      hint: 'Run /careerpilot-research "Irving Materials" in Claude Code.',
    })
    expect(result.kind).toBe("missing")
    if (result.kind === "missing") {
      expect(result.data.slug).toBe("irving_materials")
      expect(result.data.hint).toContain("Irving Materials")
    }
  })

  it("classifies a missing body without hint, defaulting hint to empty", () => {
    const result = classifyResearch404({ found: false, slug: "acme_corp" })
    expect(result.kind).toBe("missing")
    if (result.kind === "missing") {
      expect(result.data.slug).toBe("acme_corp")
      expect(result.data.hint).toBe("")
    }
  })

  it("classifies an application-not-found body as 'error' with the error message", () => {
    const result = classifyResearch404({ error: "Application not found" })
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toBe("Application not found")
    }
  })

  it("classifies an unrelated body as 'error' with default message", () => {
    const result = classifyResearch404({ unrelated: "field" })
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toBe("Application not found")
    }
  })

  it("classifies null or undefined as 'error' (defensive — should never happen on a real 404)", () => {
    expect(classifyResearch404(null).kind).toBe("error")
    expect(classifyResearch404(undefined).kind).toBe("error")
  })

  it("treats found:true as 'error' (a 200 response would never call this; defensive)", () => {
    // The hook only calls classifyResearch404 on a 404 status. If somehow called on a
    // found:true body, it should NOT misclassify it as 'missing'.
    const result = classifyResearch404({ found: true, slug: "x", markdown: "y" })
    expect(result.kind).toBe("error")
  })
})
