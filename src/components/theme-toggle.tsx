'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch: only render icon after mount
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label={isDark ? 'Ativar modo dia' : 'Ativar modo noite'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'group relative grid h-9 w-9 place-items-center rounded-xl border border-border transition',
        'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4 transition-transform group-hover:rotate-12" />
        ) : (
          <Moon className="h-4 w-4 transition-transform group-hover:-rotate-12" />
        )
      ) : (
        // SSR placeholder — same size, invisible
        <span className="h-4 w-4" />
      )}
    </button>
  )
}
