import type { CSSProperties } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  Heart,
  Lightbulb,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const icons: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  check: CheckCircle2,
  star: Star,
  shield: ShieldCheck,
  heart: Heart,
  bolt: Zap,
  target: Target,
  rocket: Rocket,
  idea: Lightbulb,
  badge: BadgeCheck,
}

export function FunnelIcon({
  name,
  className,
  style,
}: {
  name: unknown
  className?: string
  style?: CSSProperties
}) {
  const Icon = typeof name === 'string' ? icons[name] || Sparkles : Sparkles
  return <Icon aria-hidden="true" className={className} style={style} />
}
