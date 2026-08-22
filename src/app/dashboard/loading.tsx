// Shown automatically by React Suspense while the dashboard's Server Component
// data (workspaces, quizzes, lead counts) is being fetched — mirrors the real
// page's structure so the layout doesn't jump when data arrives.
export default function DashboardLoading() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-zinc-800/80" />
          <div className="h-4 w-80 max-w-full rounded bg-zinc-800/50" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-zinc-800/80" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
            <div className="h-3.5 w-28 rounded bg-zinc-800/70" />
            <div className="h-8 w-16 rounded bg-zinc-800/80" />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="h-6 w-40 rounded bg-zinc-800/70" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="h-5 w-32 rounded bg-zinc-800/80" />
                <div className="h-5 w-16 rounded-full bg-zinc-800/60" />
              </div>
              <div className="h-3 w-full rounded bg-zinc-800/50" />
              <div className="h-10 w-full rounded-lg bg-zinc-800/40" />
              <div className="h-8 w-full rounded-lg bg-zinc-800/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
