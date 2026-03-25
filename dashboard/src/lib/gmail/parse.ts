interface GmailPart {
  mimeType: string
  body: { data?: string }
  parts?: GmailPart[]
}

export function extractBody(payload: GmailPart): string {
  // Try plain text first
  const plain = findPart(payload, "text/plain")
  if (plain?.body?.data) {
    return decodeBase64Url(plain.body.data)
  }

  // Fall back to HTML with tag stripping
  const html = findPart(payload, "text/html")
  if (html?.body?.data) {
    return stripHtml(decodeBase64Url(html.body.data))
  }

  return ""
}

function findPart(payload: GmailPart, mimeType: string): GmailPart | null {
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType)
      if (found) return found
    }
  }
  return null
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(base64, "base64").toString("utf-8")
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function extractDomain(emailOrHeader: string): string | null {
  // Handle "Name <email@domain.com>" format
  const angleMatch = emailOrHeader.match(/<([^>]+)>/)
  const email = angleMatch ? angleMatch[1] : emailOrHeader

  const atIndex = email.indexOf("@")
  if (atIndex === -1) return null

  return email.slice(atIndex + 1).toLowerCase().trim()
}

export function extractPreview(body: string, maxLength = 500): string {
  return body.slice(0, maxLength)
}
