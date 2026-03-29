"use client"

import { SEARCH_PROFILES } from "@/lib/constants"

interface ProfileChipsProps {
  selectedProfiles: Set<string>
  toggleProfile: (id: string) => void
  selectAll: () => void
  selectNone: () => void
  disabled?: boolean
}

export function ProfileChips({
  selectedProfiles,
  toggleProfile,
  selectAll,
  selectNone,
  disabled,
}: ProfileChipsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Search Profiles
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            disabled={disabled}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-zinc-400 transition-colors"
          >
            All
          </button>
          <span className="text-zinc-300">|</span>
          <button
            onClick={selectNone}
            disabled={disabled}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-zinc-400 transition-colors"
          >
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SEARCH_PROFILES.map((profile) => {
          const active = selectedProfiles.has(profile.id)
          return (
            <button
              key={profile.id}
              onClick={() => toggleProfile(profile.id)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                active
                  ? "bg-amber-50 text-amber-800 border-amber-300 shadow-sm"
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>{profile.icon}</span>
                <span>{profile.label}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="text-[10px] text-zinc-400">
        {selectedProfiles.size} of {SEARCH_PROFILES.length} profiles selected
      </div>
    </div>
  )
}
