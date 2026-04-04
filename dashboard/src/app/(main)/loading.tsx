export default function MainLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-6 w-32 bg-zinc-100 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-zinc-100 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-zinc-100 rounded-xl" />
        <div className="h-64 bg-zinc-100 rounded-xl" />
      </div>
    </div>
  )
}
