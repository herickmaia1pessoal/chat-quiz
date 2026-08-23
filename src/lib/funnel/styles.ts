import type { Breakpoint, FunnelElement, StyleProperties } from './types'

export function resolveElementStyles(
  element: FunnelElement,
  breakpoint: Breakpoint,
): StyleProperties {
  if (breakpoint === 'desktop') return { ...element.styles.desktop }
  return {
    ...element.styles.desktop,
    ...(element.styles[breakpoint] ?? {}),
  }
}

export function hasBreakpointOverride(
  element: FunnelElement,
  breakpoint: Exclude<Breakpoint, 'desktop'>,
  property: keyof StyleProperties,
) {
  return Object.prototype.hasOwnProperty.call(element.styles[breakpoint] ?? {}, property)
}
