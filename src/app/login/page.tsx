import Link from 'next/link'
import { AlertCircle, ArrowLeft, Check, Layers3, WandSparkles } from 'lucide-react'
import { login, signup } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoginButtons } from '@/components/login/login-buttons'

const benefits = [
  'Editor visual com páginas e elementos',
  'Publicação segura com histórico de versões',
  'Leads, respostas e conversão no mesmo lugar',
]

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <main className="grid min-h-screen bg-[#07080d] text-zinc-100 lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden border-r border-white/[.07] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="pointer-events-none absolute -left-24 top-1/3 size-[32rem] rounded-full bg-violet-600/20 blur-[130px]" />

        <Link href="/" className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400 shadow-[0_0_35px_rgba(124,58,237,.3)]">
            <WandSparkles className="size-5 text-white" />
          </span>
          <span className="text-base font-extrabold">FunnelFlow</span>
          <span className="rounded-full border border-violet-400/20 bg-violet-400/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.18em] text-violet-300">Studio</span>
        </Link>

        <div className="relative max-w-xl">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04]">
            <Layers3 className="size-5 text-violet-400" />
          </div>
          <h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-[-.05em] text-white">Sua próxima experiência começa no canvas.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">Crie funis responsivos, personalize cada detalhe e publique sem colocar o que já está no ar em risco.</p>
          <ul className="mt-9 space-y-3">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm text-zinc-300">
                <span className="flex size-6 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10"><Check className="size-3.5 text-emerald-400" /></span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-600">© 2026 FunnelFlow. Feito para equipes que convertem.</p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:px-10">
        <div className="pointer-events-none absolute right-[-12rem] top-[-8rem] size-[32rem] rounded-full bg-indigo-600/15 blur-[130px]" />
        <div className="relative w-full max-w-md">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-zinc-200 lg:hidden">
            <ArrowLeft className="size-3.5" />
            Voltar ao início
          </Link>

          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400"><WandSparkles className="size-5 text-white" /></div>
            <span className="font-extrabold text-white">FunnelFlow Studio</span>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-400">Acesse seu workspace</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-white">Bem-vindo de volta</h2>
            <p className="mt-2 text-sm text-zinc-500">Entre ou crie sua conta para começar um novo funil.</p>
          </div>

          {error && (
            <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/8 p-3.5 text-sm text-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div role="status" className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3.5 text-sm text-emerald-100">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>{message}</span>
            </div>
          )}

          <form className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold text-zinc-300">E-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" required className="h-11 rounded-xl border-white/10 bg-white/[.035] px-4 text-zinc-100 placeholder:text-zinc-600 hover:bg-white/[.05] focus:border-violet-500/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold text-zinc-300">Senha</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required className="h-11 rounded-xl border-white/10 bg-white/[.035] px-4 text-zinc-100 hover:bg-white/[.05] focus:border-violet-500/50" />
              <p className="text-[11px] text-zinc-600">Use pelo menos 6 caracteres.</p>
            </div>
            <LoginButtons loginAction={login} signupAction={signup} />
          </form>

          <p className="mt-8 text-center text-[11px] leading-5 text-zinc-600">Ao continuar, você concorda com os termos de uso e a política de privacidade.</p>
        </div>
      </section>
    </main>
  )
}
