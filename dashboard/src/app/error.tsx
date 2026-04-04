"use client"

import { AlertTriangle, RefreshCw } from "lucide-react"

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <h2 className="text-sm font-semibold text-zinc-800 mb-1">
          Something went wrong
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
        >
          <RefreshCw size={12} />
          Try again
        </button>
      </div>
    </div>
  )
}
