"use client"

import { useRouter } from "next/navigation"
import { RelativeTime } from "@/components/ui/relative-time"
import type { ContactWithLinks } from "@/types"

const ROLE_LABELS: Record<string, { label: string; className: string }> = {
  recruiter: { label: "Recruiter", className: "bg-blue-50 text-blue-700 border-blue-200" },
  hiring_manager: { label: "Hiring Mgr", className: "bg-purple-50 text-purple-700 border-purple-200" },
  interviewer: { label: "Interviewer", className: "bg-green-50 text-green-700 border-green-200" },
  hr: { label: "HR", className: "bg-orange-50 text-orange-700 border-orange-200" },
  referral: { label: "Referral", className: "bg-amber-50 text-amber-700 border-amber-200" },
}

interface ContactRowProps {
  contact: ContactWithLinks
}

export function ContactRow({ contact }: ContactRowProps) {
  const router = useRouter()

  // Derive the primary role from the first linked application, if any
  const linkedApps = contact.applications ?? []
  const linkCount = contact.link_count ?? linkedApps.length

  // Use the role label styling if we have any application links
  // (role is on the join table, so we surface it via link_count only here)
  const roleBadge = null as null // role shown via link count for now

  function handleClick() {
    router.push(`/contacts/${contact.id}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick()
      }}
      className="flex items-center gap-4 px-4 py-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 hover:shadow-sm cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-amber-300"
    >
      {/* Avatar initials */}
      <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 flex-shrink-0">
        {contact.name
          .split(" ")
          .slice(0, 2)
          .map((n) => n[0]?.toUpperCase() ?? "")
          .join("")}
      </div>

      {/* Name + company/title */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-zinc-900 truncate">{contact.name}</div>
        {(contact.title || contact.company) && (
          <div className="text-xs text-zinc-500 truncate">
            {[contact.title, contact.company].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Role badge placeholder (role is per-link; show email as hint) */}
      {contact.email && (
        <div className="hidden sm:block text-xs text-zinc-400 truncate max-w-[160px]">
          {contact.email}
        </div>
      )}

      {/* Linked app count */}
      {linkCount > 0 && (
        <div className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
          {linkCount} app{linkCount !== 1 ? "s" : ""}
        </div>
      )}

      {/* Last contact date */}
      {contact.last_contact_date ? (
        <div className="flex-shrink-0 text-xs text-zinc-400">
          <RelativeTime date={contact.last_contact_date} />
        </div>
      ) : (
        <div className="flex-shrink-0 text-xs text-zinc-300">No contact</div>
      )}
    </div>
  )
}
