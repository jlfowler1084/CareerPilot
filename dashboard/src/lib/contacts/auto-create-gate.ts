interface AutoCreateCandidate {
  from_email: string | null
  from_name: string | null
  replied_at: string | null
}

const BLOCKED_LOCAL_PARTS = [
  "donotreply",
  "noreply",
  "no-reply",
  "hit-reply",
  "inmail-hit-reply",
  "bounce",
  "mailer-daemon",
  "notifications",
  "postmaster",
]

const BLOCKED_DOMAINS = [
  "linkedin.com",
  "match.indeed.com",
]

export function shouldAutoCreateContact(
  candidate: AutoCreateCandidate,
  userEmail: string
): { allow: boolean; reason?: string } {
  if (!candidate.from_email) {
    return { allow: false, reason: "missing from_email" }
  }
  const email = candidate.from_email.trim().toLowerCase()

  if (email === userEmail.trim().toLowerCase()) {
    return { allow: false, reason: "sender is the user themselves" }
  }

  const localPart = email.split("@")[0] ?? ""
  if (BLOCKED_LOCAL_PARTS.some((p) => localPart.includes(p))) {
    return { allow: false, reason: `blocked local part: ${localPart}` }
  }

  const domain = email.split("@")[1] ?? ""
  if (BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { allow: false, reason: `blocked domain: ${domain}` }
  }

  if (!candidate.replied_at) {
    return { allow: false, reason: "user has not replied to this thread yet" }
  }

  return { allow: true }
}
