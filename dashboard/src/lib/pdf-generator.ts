import PDFDocument from "pdfkit"
import path from "path"

// Resolve PDFKit's built-in font data directory to avoid ENOENT on Next.js dev server
const PDFKIT_FONT_DIR = path.join(
  path.dirname(require.resolve("pdfkit/package.json")),
  "js",
  "data"
)

const FONTS = {
  regular: path.join(PDFKIT_FONT_DIR, "Helvetica.afm"),
  bold: path.join(PDFKIT_FONT_DIR, "Helvetica-Bold.afm"),
  oblique: path.join(PDFKIT_FONT_DIR, "Helvetica-Oblique.afm"),
}

// ─── Resume PDF ──────────────────────────────────────

interface PdfMetadata {
  name: string
  title: string
  company: string
}

/**
 * Parse the structured resume text into renderable sections.
 * The text follows a consistent format:
 * - Line 1: Name (centered, large)
 * - Line 2: Contact info (centered, small)
 * - ALL CAPS lines: Section headers
 * - Lines starting with "•" or "- ": Bullet points
 * - Lines with " — ": Company headers (e.g., "Venable LLP — Baltimore, MD")
 * - Lines after company with "·": Role/date lines
 */
interface ResumeSection {
  type: "name" | "contact" | "header" | "bullet" | "company" | "role" | "text" | "blank"
  text: string
}

function parseResumeText(text: string): ResumeSection[] {
  const lines = text.split("\n")
  const sections: ResumeSection[] = []
  let lineIndex = 0

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (lineIndex === 0 && line.trim()) {
      sections.push({ type: "name", text: line.trim() })
      lineIndex++
      continue
    }

    if (lineIndex === 1 && line.trim()) {
      sections.push({ type: "contact", text: line.trim() })
      lineIndex++
      continue
    }

    lineIndex++

    // Blank lines
    if (!line.trim()) {
      sections.push({ type: "blank", text: "" })
      continue
    }

    // ALL CAPS section headers (at least 3 chars, all uppercase/spaces/&)
    if (line.trim().length >= 3 && line.trim() === line.trim().toUpperCase() && /^[A-Z\s&]+$/.test(line.trim())) {
      sections.push({ type: "header", text: line.trim() })
      continue
    }

    // Bullet points
    if (line.trimStart().startsWith("•") || line.trimStart().startsWith("- ")) {
      const bulletText = line.trimStart().replace(/^[•\-]\s*/, "")
      sections.push({ type: "bullet", text: bulletText })
      continue
    }

    // Company headers — contain " — " (em dash or double hyphen)
    if (line.includes(" — ") || line.includes(" -- ")) {
      sections.push({ type: "company", text: line.trim() })
      continue
    }

    // Role lines — contain " · " (middle dot) typically after a company line
    if (line.includes(" · ") && sections.length > 0 && sections[sections.length - 1]?.type === "company") {
      sections.push({ type: "role", text: line.trim() })
      continue
    }

    // Everything else is body text
    sections.push({ type: "text", text: line.trim() })
  }

  return sections
}

export async function generateResumePdf(
  resumeText: string,
  metadata: PdfMetadata
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
    })

    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    const sections = parseResumeText(resumeText)

    for (const section of sections) {
      // Check if we need a new page (leave 72pt / 1 inch at bottom)
      if (doc.y > doc.page.height - doc.page.margins.bottom - 36) {
        doc.addPage()
      }

      switch (section.type) {
        case "name":
          doc
            .font(FONTS.bold)
            .fontSize(18)
            .text(section.text, { align: "center" })
          doc.moveDown(0.2)
          break

        case "contact":
          doc
            .font(FONTS.regular)
            .fontSize(10)
            .text(section.text, { align: "center" })
          doc.moveDown(0.5)
          break

        case "header":
          doc.moveDown(0.4)
          doc
            .font(FONTS.bold)
            .fontSize(12)
            .text(section.text, { align: "left" })
          // Thin horizontal rule below header
          const ruleY = doc.y + 2
          doc
            .moveTo(doc.page.margins.left, ruleY)
            .lineTo(doc.page.margins.left + pageWidth, ruleY)
            .strokeColor("#000000")
            .lineWidth(0.5)
            .stroke()
          doc.moveDown(0.3)
          break

        case "company":
          doc.moveDown(0.15)
          doc
            .font(FONTS.bold)
            .fontSize(11)
            .text(section.text, { align: "left" })
          break

        case "role":
          doc
            .font(FONTS.oblique)
            .fontSize(10.5)
            .text(section.text, { align: "left" })
          doc.moveDown(0.15)
          break

        case "bullet":
          doc
            .font(FONTS.regular)
            .fontSize(10.5)
            .text(`•  ${section.text}`, {
              align: "left",
              indent: 12,
              lineGap: 1.5,
            })
          break

        case "text":
          doc
            .font(FONTS.regular)
            .fontSize(10.5)
            .text(section.text, {
              align: "left",
              lineGap: 1.5,
            })
          break

        case "blank":
          doc.moveDown(0.3)
          break
      }
    }

    doc.end()
  })
}

// ─── Cover Letter PDF ────────────────────────────────

export async function generateCoverLetterPdf(
  coverLetterText: string,
  metadata: PdfMetadata
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
    })

    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    // Header: Name
    doc
      .font(FONTS.bold)
      .fontSize(14)
      .text(metadata.name, { align: "left" })
    doc.moveDown(0.3)

    // Parse the cover letter — it's a business letter format
    const lines = coverLetterText.split("\n")
    let inBody = false

    for (const rawLine of lines) {
      const line = rawLine.trim()

      // Check for page overflow
      if (doc.y > doc.page.height - doc.page.margins.bottom - 36) {
        doc.addPage()
      }

      if (!line) {
        doc.moveDown(0.5)
        continue
      }

      // Detect salutation (Dear ...)
      if (line.startsWith("Dear ")) {
        inBody = true
        doc
          .font(FONTS.regular)
          .fontSize(10.5)
          .text(line, { align: "left" })
        doc.moveDown(0.5)
        continue
      }

      // Detect closing (Sincerely, Best regards, etc.)
      if (/^(Sincerely|Best regards|Regards|Respectfully|Warm regards),?$/i.test(line)) {
        doc.moveDown(0.5)
        doc
          .font(FONTS.regular)
          .fontSize(10.5)
          .text(line, { align: "left" })
        doc.moveDown(1.5)
        continue
      }

      if (inBody) {
        // Body paragraph
        doc
          .font(FONTS.regular)
          .fontSize(10.5)
          .text(line, { align: "left", lineGap: 2 })
      } else {
        // Pre-body content (date, recipient address, etc.)
        doc
          .font(FONTS.regular)
          .fontSize(10)
          .text(line, { align: "left" })
      }
    }

    doc.end()
  })
}
