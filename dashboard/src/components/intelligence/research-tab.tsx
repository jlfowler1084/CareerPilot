"use client"

import { useResearch } from "@/hooks/use-research"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { FileSearch, Copy, Check } from "lucide-react"
import { useState } from "react"

interface ResearchTabProps {
  applicationId: string
  companyName: string
  enabled?: boolean
}

export function ResearchTab({ applicationId, companyName, enabled = true }: ResearchTabProps) {
  const { data, loading, error } = useResearch(applicationId, enabled)
  const [copied, setCopied] = useState(false)

  const command = `/careerpilot-research "${companyName}"`

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — silently fail; user can still type the command
    }
  }

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-zinc-400 animate-pulse">
        Loading research…
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs text-red-600">Failed to load research: {error}</p>
      </div>
    )
  }

  if (!data || !data.found) {
    return (
      <div className="py-6 px-4 flex flex-col items-center text-center gap-3">
        <FileSearch size={24} className="text-zinc-300" />
        <div>
          <p className="text-sm font-medium text-zinc-700">No research yet</p>
          <p className="text-xs text-zinc-500 mt-1">
            Run the deep-research skill in Claude Code to populate this tab.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 font-mono text-xs text-zinc-700">
          <span>{command}</span>
          <button
            type="button"
            onClick={copyCommand}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            title="Copy command to clipboard"
            aria-label="Copy command"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-100">
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
          {data.filename}
        </span>
        <span className="text-[10px] text-zinc-400">accessed {data.date}</span>
      </div>
      <article className="prose prose-sm prose-zinc max-w-none prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-p:text-xs prose-li:text-xs prose-table:text-xs prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.markdown}</ReactMarkdown>
      </article>
    </div>
  )
}
