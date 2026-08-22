'use client'

import { ArrowRight, Quote, Star, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Standalone social-proof card — same "not a question" narrative role as
// content/comparison, but focused purely on a single testimonial (title is
// still shown above it as a section heading, e.g. "O que dizem sobre nós").
export function TestimonialStep({
  title,
  text,
  author,
  authorRole,
  rating,
  avatarUrl,
  onContinue,
}: {
  title: string
  text?: string
  author?: string
  authorRole?: string
  rating?: number
  avatarUrl?: string
  onContinue: () => void
}) {
  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <h2 className="text-lg sm:text-xl font-bold text-white leading-snug text-center">{title}</h2>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-3">
        {rating && rating > 0 && (
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}`}
              />
            ))}
          </div>
        )}

        <Quote className="h-5 w-5 text-indigo-400" />

        {text && <p className="text-zinc-200 text-sm sm:text-base italic leading-relaxed">{text}</p>}

        {(author || authorRole) && (
          <div className="flex items-center gap-2.5 pt-1">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={author || 'Avatar'} className="h-9 w-9 rounded-full object-cover border border-zinc-800" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                <User className="h-4 w-4 text-zinc-500" />
              </div>
            )}
            <div>
              {author && <p className="text-zinc-200 text-xs font-semibold">{author}</p>}
              {authorRole && <p className="text-zinc-500 text-[11px]">{authorRole}</p>}
            </div>
          </div>
        )}
      </div>

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
