'use client'

import { useEffect, useState } from 'react'

// Fake multi-stage "analyzing" sequence shown between finishing the quiz and
// revealing the calculated result. Purely perceptual — no real analysis runs
// here — but it's what makes a scored result feel computed rather than just
// looked up, matching the pattern seen on competing quiz funnels.
export function ProcessingScreen({
  messages,
  onComplete,
}: {
  messages: string[]
  onComplete: () => void
}) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  const safeMessages = messages.length > 0 ? messages : ['Calculando seu resultado...']

  useEffect(() => {
    let cancelled = false
    // Each message gets its own progress ramp (0 → ~92%) over a fixed
    // duration, then a short pause at "near done" before the next message
    // takes over. The interval-based ramp (rather than a CSS transition to
    // 100%) is what makes each stage feel like independent work happening,
    // not just one bar filling up once.
    const perMessageDurationMs = 1500

    async function runStage(index: number) {
      if (cancelled) return
      setMessageIndex(index)
      setProgress(0)

      const steps = 20
      for (let i = 1; i <= steps; i++) {
        if (cancelled) return
        await new Promise((resolve) => setTimeout(resolve, perMessageDurationMs / steps))
        // Ease toward ~92% within a stage — the final jump to 100% happens
        // on the very last message right before onComplete fires.
        const isLastMessage = index === safeMessages.length - 1
        const ceiling = isLastMessage ? 100 : 92
        setProgress(Math.min(ceiling, Math.round((i / steps) * ceiling)))
      }

      if (cancelled) return
      if (index < safeMessages.length - 1) {
        await runStage(index + 1)
      } else {
        await new Promise((resolve) => setTimeout(resolve, 400))
        if (!cancelled) onComplete()
      }
    }

    runStage(0)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full text-center space-y-6 animate-in fade-in duration-300 py-10">
      <div className="rounded-3xl border border-border bg-card p-8 backdrop-blur-2xl shadow-2xl space-y-5 max-w-md mx-auto">
        <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug min-h-[3.5rem] flex items-center justify-center">
          {safeMessages[messageIndex]}
        </h2>
        <div className="space-y-2">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-150 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="font-mono text-sm text-indigo-400 font-semibold tabular-nums">{progress}%</p>
        </div>
      </div>
    </div>
  )
}
