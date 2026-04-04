export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-zinc-200 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-mono">Loading...</p>
      </div>
    </div>
  )
}
