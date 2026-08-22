'use client'

interface RulerLevel {
  name: string
  minScore: number
  maxScore: number
  color: string
}

interface ScoredResult {
  score: number
  levelName: string
  levelDescription: string | null
  levelColor: string
  allLevels: RulerLevel[]
}

// The calculated-result "ruler" screen: a horizontal scale across every
// configured level, with a marker showing where this respondent's score
// landed. Mirrors the diagnostic-quiz pattern of showing a named tier
// (not just a raw number) so the result reads as a personalized finding.
export function ScoredResultScreen({ result }: { result: ScoredResult }) {
  const { score, levelName, levelDescription, levelColor, allLevels } = result

  const minPossible = allLevels.length > 0 ? allLevels[0].minScore : 0
  const maxPossible = allLevels.length > 0 ? allLevels[allLevels.length - 1].maxScore : 100
  const range = Math.max(1, maxPossible - minPossible)
  const markerPercent = Math.min(100, Math.max(0, ((score - minPossible) / range) * 100))

  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Seu resultado</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Nível <span style={{ color: levelColor }}>{levelName}</span>
        </h2>
        {levelDescription && (
          <p className="text-zinc-400 text-sm max-w-sm mx-auto pt-1">{levelDescription}</p>
        )}
      </div>

      {allLevels.length > 1 && (
        <div className="pt-2">
          <div className="relative">
            {/* "You are here" marker, positioned by score along the full scale */}
            <div
              className="absolute -top-7 -translate-x-1/2 flex flex-col items-center transition-all duration-700"
              style={{ left: `${markerPercent}%` }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-950 bg-white px-2 py-0.5 rounded-full whitespace-nowrap">
                Você
              </span>
              <span className="h-2 w-2 rotate-45 bg-white -mt-1" />
            </div>

            <div className="w-full h-3 rounded-full overflow-hidden border border-zinc-800 flex">
              {allLevels.map((level) => (
                <div
                  key={level.name}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${((level.maxScore - level.minScore + 1) / (range + 1)) * 100}%`,
                    backgroundColor: level.color,
                    opacity: level.name === levelName ? 1 : 0.35,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 px-0.5 pt-2 font-medium">
            {allLevels.map((level) => (
              <span
                key={level.name}
                className={level.name === levelName ? 'text-zinc-200 font-semibold' : ''}
              >
                {level.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
