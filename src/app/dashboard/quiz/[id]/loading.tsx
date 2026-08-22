// Shown while the quiz builder's data (quiz, questions, leads, funnel metrics)
// is being fetched — mirrors the header + tabs shell so navigation into a quiz
// doesn't flash a blank page before the real content is ready.
export default function QuizBuilderLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-zinc-800/80" />
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-zinc-800/80" />
            <div className="h-3 w-32 rounded bg-zinc-800/50" />
          </div>
        </div>
        <div className="h-10 w-36 rounded-lg bg-zinc-800/70" />
      </div>

      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-32 rounded-lg bg-zinc-900 border border-zinc-800" />
        ))}
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-2xl border border-zinc-800 bg-zinc-900/40" />
        ))}
      </div>
    </div>
  )
}
