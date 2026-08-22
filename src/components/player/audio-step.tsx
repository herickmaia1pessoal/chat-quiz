'use client'

import { ArrowRight, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Embedded audio player — used for a voice message or narrated explanation
// mid-flow. Uses the browser's native <audio controls> rather than a custom
// player: fewer edge cases, works with keyboard/screen readers out of the
// box, and autoplay-with-sound would be blocked by most browsers anyway.
export function AudioStep({
  title,
  body,
  audioUrl,
  onContinue,
}: {
  title: string
  body?: string
  audioUrl?: string
  onContinue: () => void
}) {
  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-1 text-center">
        <div className="h-12 w-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2">
          <Volume2 className="h-5 w-5" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{title}</h2>
        {body && <p className="text-zinc-400 text-xs sm:text-sm">{body}</p>}
      </div>

      {audioUrl ? (
        <audio controls className="w-full" src={audioUrl}>
          Seu navegador não suporta reprodução de áudio.
        </audio>
      ) : (
        <p className="text-zinc-600 text-xs text-center italic">Nenhum áudio configurado.</p>
      )}

      <Button
        type="button"
        onClick={onContinue}
        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
      >
        Continuar <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
