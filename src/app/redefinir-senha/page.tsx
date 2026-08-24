import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, KeyRound, WandSparkles } from 'lucide-react'
import { updatePassword } from './actions'
import { createClient } from '@/utils/supabase/server'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Redefinir senha',
  description: 'Defina uma nova senha para sua conta.',
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  // This page only makes sense right after the /auth/callback route
  // exchanged the email link's one-time code for a session. Without one,
  // there's nothing to reset — send the person to request a fresh link
  // instead of showing a form that will just fail on submit.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login/esqueci-senha?error=Solicite%20um%20novo%20link%20para%20redefinir%20sua%20senha')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07080d] px-5 py-12 text-zinc-100 sm:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-12rem] top-[-8rem] size-[32rem] rounded-full bg-indigo-600/15 blur-[130px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8">
          <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400">
            <WandSparkles className="size-5 text-white" />
          </div>
          <span className="font-extrabold text-white">FunnelFlow Studio</span>
        </div>

        <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04]">
          <KeyRound className="size-5 text-violet-400" />
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-400">Nova senha</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-white">Crie uma nova senha</h1>
          <p className="mt-2 text-sm text-zinc-500">Escolha uma senha forte para <span className="text-zinc-300">{user.email}</span>.</p>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/8 p-3.5 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form action={updatePassword} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-semibold text-zinc-300">Nova senha</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required className="h-11 rounded-xl border-white/10 bg-white/[.035] px-4 text-zinc-100 hover:bg-white/[.05] focus:border-violet-500/50" />
            <p className="text-[11px] text-zinc-600">Use pelo menos 6 caracteres.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-xs font-semibold text-zinc-300">Confirmar nova senha</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} required className="h-11 rounded-xl border-white/10 bg-white/[.035] px-4 text-zinc-100 hover:bg-white/[.05] focus:border-violet-500/50" />
          </div>
          <Button type="submit" className="h-11 w-full border-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 font-bold text-white shadow-[0_12px_35px_rgba(99,102,241,.2)] hover:brightness-110">
            Redefinir senha
          </Button>
        </form>

        <p className="mt-8 text-center text-[11px] leading-5 text-zinc-600">
          Mudou de ideia? <Link href="/login" className="font-semibold text-zinc-400 underline underline-offset-4 hover:text-zinc-200">Voltar ao login</Link>
        </p>
      </div>
    </main>
  )
}
