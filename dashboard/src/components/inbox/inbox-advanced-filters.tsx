"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { X } from "lucide-react"
import {
  type InboxAdvancedFilters,
  DEFAULT_INBOX_ADVANCED_FILTERS,
  hasActiveInboxAdvancedFilters,
  countActiveInboxAdvancedFilters,
} from "@/lib/inbox-filter-utils"
import type { Email } from "@/types"

interface InboxAdvancedFiltersProps {
  filters: InboxAdvancedFilters
  onFiltersChange: (filters: InboxAdvancedFilters) => void
  emails: Email[]
}

export function InboxAdvancedFiltersPanel({
  filters,
  onFiltersChange,
  emails,
}: InboxAdvancedFiltersProps) {
  const [expanded, setExpanded] = useState(false)
  const active = hasActiveInboxAdvancedFilters(filters)
  const activeCount = countActiveInboxAdvancedFilters(filters)

  // Text inputs (raw text before splitting by comma)
  const [senderIncText, setSenderIncText] = useState("")
  const [senderExcText, setSenderExcText] = useState("")
  const [domainIncText, setDomainIncText] = useState("")
  const [domainExcText, setDomainExcText] = useState("")
  const [subjectIncText, setSubjectIncText] = useState("")
  const [subjectExcText, setSubjectExcText] = useState("")
  const [bodyKwText, setBodyKwText] = useState("")

  // Domain autocomplete
  const [domainQuery, setDomainQuery] = useState("")
  const [domainDropdownOpen, setDomainDropdownOpen] = useState(false)
  const domainInputRef = useRef<HTMLInputElement>(null)
  const domainDropdownRef = useRef<HTMLDivElement>(null)

  // Click outside to close domain dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        domainDropdownRef.current &&
        !domainDropdownRef.current.contains(e.target as Node) &&
        domainInputRef.current &&
        !domainInputRef.current.contains(e.target as Node)
      ) {
        setDomainDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Unique domains from emails with counts
  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const email of emails) {
      const domain = (email.from_domain || "").toLowerCase().trim()
      if (domain) counts.set(domain, (counts.get(domain) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }))
  }, [emails])

  const filteredDomains = useMemo(() => {
    const q = domainQuery.toLowerCase()
    const selected = new Set(filters.domainInclude.map((d) => d.toLowerCase()))
    return domainCounts
      .filter((d) => !selected.has(d.domain))
      .filter((d) => !q || d.domain.includes(q))
      .slice(0, 10)
  }, [domainCounts, domainQuery, filters.domainInclude])

  function update(patch: Partial<InboxAdvancedFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  function splitComma(text: string): string[] {
    return text.split(",").map((s) => s.trim()).filter(Boolean)
  }

  function addDomainInclude(domain: string) {
    if (!filters.domainInclude.includes(domain)) {
      update({ domainInclude: [...filters.domainInclude, domain] })
    }
    setDomainQuery("")
    setDomainDropdownOpen(false)
  }

  function removeDomainInclude(domain: string) {
    update({ domainInclude: filters.domainInclude.filter((d) => d !== domain) })
  }

  function clearAll() {
    onFiltersChange(DEFAULT_INBOX_ADVANCED_FILTERS)
    setSenderIncText("")
    setSenderExcText("")
    setDomainIncText("")
    setDomainExcText("")
    setSubjectIncText("")
    setSubjectExcText("")
    setBodyKwText("")
    setDomainQuery("")
  }

  return (
    <div>
      {/* Toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors py-1"
      >
        <span className="text-[10px]">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span>
          Advanced Filters
          {active && !expanded && (
            <span className="ml-1 text-amber-600 dark:text-amber-400 font-semibold">
              ({activeCount} active)
            </span>
          )}
        </span>
      </button>

      {/* Panel */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expanded ? "700px" : "0px", opacity: expanded ? 1 : 0 }}
      >
        <div className="mt-2 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 space-y-4">
          {/* a) Sender include/exclude */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Sender
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Include (any match)
                </label>
                <input
                  type="text"
                  value={senderIncText}
                  onChange={(e) => {
                    setSenderIncText(e.target.value)
                    update({ senderInclude: splitComma(e.target.value) })
                  }}
                  placeholder="e.g., LinkedIn, Google, recruiter"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Exclude (any match)
                </label>
                <input
                  type="text"
                  value={senderExcText}
                  onChange={(e) => {
                    setSenderExcText(e.target.value)
                    update({ senderExclude: splitComma(e.target.value) })
                  }}
                  placeholder="e.g., noreply, newsletter"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
            </div>
          </div>

          {/* b) Domain include (autocomplete) / exclude */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Domain
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Include (autocomplete)
                </label>
                <div className="relative">
                  <input
                    ref={domainInputRef}
                    type="text"
                    value={domainQuery}
                    onChange={(e) => {
                      setDomainQuery(e.target.value)
                      setDomainDropdownOpen(true)
                    }}
                    onFocus={() => setDomainDropdownOpen(true)}
                    placeholder="Type to search domains..."
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                  />
                  {domainDropdownOpen && filteredDomains.length > 0 && (
                    <div
                      ref={domainDropdownRef}
                      className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-y-auto"
                    >
                      {filteredDomains.map((d) => (
                        <button
                          key={d.domain}
                          type="button"
                          onClick={() => addDomainInclude(d.domain)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-between"
                        >
                          <span className="text-zinc-800 dark:text-zinc-200 truncate">{d.domain}</span>
                          <span className="text-zinc-400 dark:text-zinc-500 shrink-0 ml-2">({d.count})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Selected domain chips */}
                {filters.domainInclude.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {filters.domainInclude.map((domain) => (
                      <span
                        key={domain}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                      >
                        {domain}
                        <button
                          type="button"
                          title={`Remove ${domain}`}
                          onClick={() => removeDomainInclude(domain)}
                          className="hover:opacity-70"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Exclude domains
                </label>
                <input
                  type="text"
                  value={domainExcText}
                  onChange={(e) => {
                    setDomainExcText(e.target.value)
                    update({ domainExclude: splitComma(e.target.value) })
                  }}
                  placeholder="e.g., linkedin.com, indeed.com"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
            </div>
          </div>

          {/* c) Subject include/exclude */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Subject
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Must contain (any)
                </label>
                <input
                  type="text"
                  value={subjectIncText}
                  onChange={(e) => {
                    setSubjectIncText(e.target.value)
                    update({ subjectInclude: splitComma(e.target.value) })
                  }}
                  placeholder="e.g., interview, engineer, DevOps"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 block">
                  Exclude (any)
                </label>
                <input
                  type="text"
                  value={subjectExcText}
                  onChange={(e) => {
                    setSubjectExcText(e.target.value)
                    update({ subjectExclude: splitComma(e.target.value) })
                  }}
                  placeholder="e.g., unsubscribe, newsletter"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
                />
              </div>
            </div>
          </div>

          {/* d) Body keywords */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
              Body Keywords
            </span>
            <input
              type="text"
              value={bodyKwText}
              onChange={(e) => {
                setBodyKwText(e.target.value)
                update({ bodyKeywords: splitComma(e.target.value) })
              }}
              placeholder="e.g., PowerShell, Azure, Kubernetes, salary"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
            />
          </div>

          {/* e) Clear All */}
          {active && (
            <div className="flex justify-end pt-1 border-t border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Clear Advanced Filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
