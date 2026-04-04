import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
          <span className="text-2xl font-bold text-amber-500">?</span>
        </div>
        <h2 className="text-sm font-semibold text-zinc-800 mb-1">
          Page not found
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          Back to Overview
        </Link>
      </div>
    </div>
  )
}
