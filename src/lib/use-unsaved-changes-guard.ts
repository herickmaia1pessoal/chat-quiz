'use client'

import { useCallback, useEffect, useRef } from 'react'

const HISTORY_MARKER = '__funnelflowUnsavedGuard'

export function useUnsavedChangesGuard(active: boolean, message: string) {
  const markerId = useRef(crypto.randomUUID())
  const bypass = useRef(false)

  useEffect(() => {
    if (!active) {
      bypass.current = false
      return
    }

    bypass.current = false
    const protectedUrl = window.location.href
    const markerState = {
      ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
      [HISTORY_MARKER]: markerId.current,
    }
    if (window.history.state?.[HISTORY_MARKER] !== markerId.current) {
      window.history.pushState(markerState, '', protectedUrl)
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (bypass.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const confirmNavigation = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement)) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#') || target.target === '_blank' || target.hasAttribute('download')) return
      if (window.confirm(message)) {
        bypass.current = true
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const guardHistoryNavigation = () => {
      if (bypass.current) return
      if (window.confirm(message)) {
        bypass.current = true
        window.history.back()
        return
      }
      window.history.pushState(markerState, '', protectedUrl)
    }

    window.addEventListener('beforeunload', beforeUnload)
    window.document.addEventListener('click', confirmNavigation, true)
    window.addEventListener('popstate', guardHistoryNavigation)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.document.removeEventListener('click', confirmNavigation, true)
      window.removeEventListener('popstate', guardHistoryNavigation)
    }
  }, [active, message])

  return useCallback(() => {
    if (!active) return true
    const confirmed = window.confirm(message)
    if (confirmed) bypass.current = true
    return confirmed
  }, [active, message])
}
