"use client"

import { useState } from "react"
import { MoreHorizontal, Pencil, Trash2, Copy, EyeOff, Check, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { SearchProfile } from "@/hooks/use-search-profiles"

interface ProfileChipsProps {
  profiles: SearchProfile[]
  selectedProfiles: Set<string>
  toggleProfile: (id: string) => void
  selectAll: () => void
  selectNone: () => void
  disabled?: boolean
  onEditProfile?: (id: string, updates: Partial<SearchProfile>) => void
  onDeleteProfile?: (id: string) => void
  onDuplicateProfile?: (profile: SearchProfile) => void
  onHideProfile?: (id: string) => void
  hiddenProfiles?: Set<string>
}

const SOURCE_OPTIONS = [
  { value: "both", label: "Both" },
  { value: "dice", label: "Dice" },
  { value: "indeed", label: "Indeed" },
] as const

const ICON_OPTIONS = [
  "\uD83D\uDD0D", "\uD83D\uDDA5\uFE0F", "\u2699\uFE0F", "\u2601\uFE0F",
  "\uD83D\uDCDC", "\uD83C\uDFD7\uFE0F", "\uD83D\uDD27", "\uD83D\uDCCB",
  "\uD83D\uDD10", "\uD83D\uDCBC", "\uD83C\uDF10", "\uD83D\uDEE1\uFE0F",
]

export function ProfileChips({
  profiles,
  selectedProfiles,
  toggleProfile,
  selectAll,
  selectNone,
  disabled,
  onEditProfile,
  onDeleteProfile,
  onDuplicateProfile,
  onHideProfile,
  hiddenProfiles = new Set(),
}: ProfileChipsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<{
    name: string
    keyword: string
    location: string
    source: string
    icon: string
  }>({ name: "", keyword: "", location: "", source: "both", icon: "" })
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const visibleProfiles = profiles.filter((p) => !hiddenProfiles.has(p.id))

  function startEdit(profile: SearchProfile) {
    setEditingId(profile.id)
    setEditState({
      name: profile.name,
      keyword: profile.keyword,
      location: profile.location,
      source: profile.source,
      icon: profile.icon,
    })
    setDeletingId(null)
  }

  function saveEdit() {
    if (!editingId || !onEditProfile) return
    onEditProfile(editingId, {
      name: editState.name,
      keyword: editState.keyword,
      location: editState.location,
      source: editState.source as SearchProfile["source"],
      icon: editState.icon,
    })
    setEditingId(null)
  }

  function handleDelete(profile: SearchProfile) {
    if (profile.is_default) {
      onHideProfile?.(profile.id)
      setDeletingId(null)
    } else {
      onDeleteProfile?.(profile.id)
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
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
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <button
            onClick={selectNone}
            disabled={disabled}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-zinc-400 transition-colors"
          >
            None
          </button>
          {hiddenProfiles.size > 0 && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <button
                onClick={() => {
                  // Handled by parent via onHideProfile — signal to show all
                  onHideProfile?.("__show_all__")
                }}
                className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Show Hidden ({hiddenProfiles.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editingId && (
        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={editState.name}
              onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
              placeholder="Profile name"
              className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <input
              type="text"
              value={editState.keyword}
              onChange={(e) => setEditState((s) => ({ ...s, keyword: e.target.value }))}
              placeholder="Keywords"
              className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={editState.location}
              onChange={(e) => setEditState((s) => ({ ...s, location: e.target.value }))}
              placeholder="Location"
              className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <select
              value={editState.source}
              onChange={(e) => setEditState((s) => ({ ...s, source: e.target.value }))}
              title="Search source"
              className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            {ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                onClick={() => setEditState((s) => ({ ...s, icon }))}
                className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-all ${
                  editState.icon === icon
                    ? "bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-600"
                    : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveEdit}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
            >
              <Check size={12} /> Save
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-zinc-500 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline delete confirmation */}
      {deletingId && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
          <span className="text-xs text-red-700 dark:text-red-400">
            {profiles.find((p) => p.id === deletingId)?.is_default
              ? `Hide "${profiles.find((p) => p.id === deletingId)?.name}"?`
              : `Delete "${profiles.find((p) => p.id === deletingId)?.name}"?`}
          </span>
          <button
            onClick={() => {
              const p = profiles.find((p) => p.id === deletingId)
              if (p) handleDelete(p)
            }}
            className="px-2.5 py-1 rounded-md bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => setDeletingId(null)}
            className="px-2.5 py-1 rounded-md text-zinc-500 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {visibleProfiles.map((profile) => {
          const active = selectedProfiles.has(profile.id)
          const isCustom = !profile.is_default
          return (
            <div key={profile.id} className="group relative inline-flex items-center">
              <button
                onClick={() => toggleProfile(profile.id)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  active
                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-sm"
                    : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                } ${isCustom ? "border-dashed" : ""} disabled:opacity-50 disabled:cursor-not-allowed pr-7`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{profile.icon}</span>
                  <span>{profile.name}</span>
                </span>
              </button>

              {/* Kebab menu */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`absolute right-1 p-0.5 rounded-full transition-opacity ${
                    isCustom
                      ? "opacity-70 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-70 hover:!opacity-100"
                  } text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300`}
                  render={<button type="button" title="Profile options" />}
                >
                  <MoreHorizontal size={12} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4}>
                  <DropdownMenuItem onClick={() => startEdit(profile)}>
                    <Pencil size={12} />
                    <span>Edit</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onDuplicateProfile?.(profile)
                    }}
                  >
                    <Copy size={12} />
                    <span>Duplicate</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {profile.is_default ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeletingId(profile.id)}
                    >
                      <EyeOff size={12} />
                      <span>Hide</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeletingId(profile.id)}
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
        {selectedProfiles.size} of {visibleProfiles.length} profiles selected
      </div>
    </div>
  )
}
