'use client'

import { useEffect } from 'react'

// Pure layout gap. Inlead treats "Espaço" as an in-page spacer between
// blocks on the same screen; this player renders one block per screen, so
// the closest equivalent is a near-instant pass-through step — it shows
// nothing and auto-advances almost immediately, giving builders a way to
// add breathing room in the *step sequence* (e.g. a beat of silence before
// a big reveal) without ever asking the visitor to click anything.
export function SpacerStep({
  heightPx = 24,
  onContinue,
}: {
  heightPx?: number
  onContinue: () => void
}) {
  useEffect(() => {
    // Scales gently with the configured "height" so a bigger spacer reads as
    // a longer pause, but stays capped well under a second either way.
    const delay = Math.min(700, 150 + heightPx * 2)
    const timer = setTimeout(onContinue, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div style={{ height: heightPx }} className="w-full" aria-hidden="true" />
}
