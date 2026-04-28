"use client"

import { useState } from "react"
import { Search, Bookmark, Zap } from "lucide-react"

const ICON_OPTIONS = [
  "\uD83D\uDD0D", "\uD83D\uDDA5\uFE0F", "\u2699\uFE0F", "\u2601\uFE0F",
  "\uD83D\uDCDC", "\uD83C\uDFD7\uFE0F", "\uD83D\uDD27", "\uD83D\uDCCB",
  "\uD83D\uDD10", "\uD83D\uDCBC", "\uD83C\uDF10", "\uD83D\uDEE1\uFE0F",
]

interface CustomSearchBarProps {
  onQuickSearch: (keyword: string, location: string, source: string) => void
  onSaveProfile: (profile: {
    name: string
    keyword: string
    location: string
    source: "dice" | "indeed" | "linkedin" | "both"
    contract_only: boolean
    icon: string
  }) => void
  disabled?: boolean
}

export function CustomSearchBar({
  onQuickSearch,
  onSaveProfile,
  disabled,
}: CustomSearchBarProps) {
  const [keyword, setKeyword] = useState("")
  const [location, setLocation] = useState("")
  const [source, setSource] = useState<"dice" | "indeed" | "linkedin" | "both">("both")
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [profileName, setProfileName] = useState("")
  const [profileIcon, setProfileIcon] = useState("\uD83D\uDD0D")

  const canSearch = keyword.trim().length > 0

  function handleQuickSearch() {
    if (!canSearch) return
    onQuickSearch(keyword.trim(), location.trim() || "remote", source)
  }

  function handleOpenSave() {
    if (!canSearch) return
    setProfileName(keyword.trim())
    setShowSaveForm(true)
  }

  function handleSave() {
    if (!profileName.trim() || !keyword.trim()) return
    onSaveProfile({
      name: profileName.trim(),
      keyword: keyword.trim(),
      location: location.trim() || "remote",
      source,
      contract_only: false,
      icon: profileIcon,
    })
    setShowSaveForm(false)
    setProfileName("")
    setProfileIcon("\uD83D\uDD0D")
    setKeyword("")
    setLocation("")
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Search size={14} className="text-zinc-400" />
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Custom Search
        </h3>
      </div>

      {/* Search inputs row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuickSearch()}
          placeholder="Search keywords (e.g., PowerShell engineer)..."
          disabled={disabled}
          className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40 disabled:opacity-50"
        />
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuickSearch()}
          placeholder="Location (e.g., Indianapolis, IN or remote)..."
          disabled={disabled}
          className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40 disabled:opacity-50 sm:max-w-[240px]"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          disabled={disabled}
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40 disabled:opacity-50 cursor-pointer sm:w-[120px]"
        >
          <option value="both">Both</option>
          <option value="dice">Dice</option>
          <option value="indeed">Indeed</option>
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleQuickSearch}
          disabled={disabled || !canSearch}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Zap size={14} />
          Quick Search
        </button>
        <button
          onClick={handleOpenSave}
          disabled={disabled || !canSearch}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Bookmark size={14} />
          Save as Profile
        </button>
      </div>

      {/* Save profile form (inline) */}
      {showSaveForm && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-500/40"
              autoFocus
            />
          </div>

          {/* Icon picker */}
          <div>
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Icon
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setProfileIcon(icon)}
                  className={`w-8 h-8 rounded-md text-base flex items-center justify-center transition-all ${
                    profileIcon === icon
                      ? "bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-400 dark:border-amber-500 shadow-sm"
                      : "bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!profileName.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Profile
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
