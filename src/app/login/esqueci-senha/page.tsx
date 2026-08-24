import Link from 'next/link'
import { AlertCircle, ArrowLeft, KeyRound, WandSparkles } from 'lucide-react'
import { requestPasswordReset } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Esqueci minha senha',
  description: 'Solicite um link para redefinir sua senha.',
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07080d] px-5 py-12 text-zinc-100 sm:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-12rem] top-[-8rem] size-[32rem] rounded-full bg-indigo-600/15 blur-[130px]" />
      </div>

      <div className="relative w-full max-w-md">
        <Link href="/login" className="mb-10 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-zinc-200">
          <ArrowLeft className="size-3.5" />
          Voltar para o login
        </Link>

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
          <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-400">Recuperar acesso</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-white">Esqueceu sua senha?</h1>
          <p className="mt-2 text-sm text-zinc-500">Informe o e-mail da sua conta e enviamos um link para você criar uma nova senha.</p>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/8 p-3.5 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form action={requestPasswordReset} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-semibold text-zinc-300">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" required className="h-11 rounded-xl border-white/10 bg-white/[.035] px-4 text-zinc-100 placeholder:text-zinc-600 hover:bg-white/[.05] focus:border-violet-500/50" />
          </div>
          <Button type="submit" className="h-11 w-full border-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 font-bold text-white shadow-[0_12px_35px_rgba(99,102,241,.2)] hover:brightness-110">
            Enviar link de redefinição
          </Button>
        </form>
      </div>
    </main>
  )
}
