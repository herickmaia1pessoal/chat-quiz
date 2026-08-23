import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Check,
  GitBranch,
  Layers3,
  MousePointer2,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { buttonVariants } from '@/components/ui/button'

const capabilities = [
  {
    icon: Layers3,
    title: 'Canvas estruturado',
    description: 'Monte páginas responsivas com seções, containers e elementos reutilizáveis.',
  },
  {
    icon: GitBranch,
    title: 'Fluxos inteligentes',
    description: 'Crie caminhos personalizados com respostas, variáveis, UTMs e pontuação.',
  },
  {
    icon: BarChart3,
    title: 'Conversão visível',
    description: 'Acompanhe visitas, inícios, conclusões e abandono em cada página.',
  },
]

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07080d] text-zinc-100 selection:bg-violet-500/40">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_76%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[42rem] w-[62rem] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-[-12rem] top-[32rem] h-[30rem] w-[30rem] rounded-full bg-cyan-500/10 blur-[130px]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="FunnelFlow, início">
          <span className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400 shadow-[0_0_35px_rgba(124,58,237,.28)]">
            <WandSparkles className="size-4.5 text-white" />
          </span>
          <span className="text-[15px] font-extrabold tracking-[-.02em] text-white">FunnelFlow</span>
          <span className="hidden rounded-full border border-violet-400/20 bg-violet-400/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.18em] text-violet-300 sm:inline">Studio</span>
        </Link>

        <nav className="flex items-center gap-2" aria-label="Navegação principal">
          <Link href="/login" className={buttonVariants({ variant: 'ghost', className: 'text-zinc-300 hover:bg-white/5 hover:text-white' })}>Entrar</Link>
          <Link href="/login" className={buttonVariants({ className: 'border-0 bg-white text-zinc-950 shadow-[0_8px_30px_rgba(255,255,255,.12)] hover:bg-zinc-200' })}>Criar conta</Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-80px)] w-full max-w-7xl items-center gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:py-20">
        <div className="max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 text-xs font-semibold text-zinc-300 backdrop-blur-xl">
            <Sparkles className="size-3.5 text-violet-400" />
            Do primeiro clique à conversão
          </div>

          <h1 className="text-balance text-5xl font-extrabold leading-[.98] tracking-[-.055em] text-white sm:text-6xl lg:text-[4.6rem]">
            Funis que parecem feitos{' '}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">sob medida.</span>
          </h1>

          <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg">
            Crie páginas, formulários e experiências interativas no mesmo canvas. Publique com segurança, capture first-party data e descubra onde cada lead converte.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className={buttonVariants({ size: 'lg', className: 'h-12 gap-2 border-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 px-6 text-sm font-bold text-white shadow-[0_15px_45px_rgba(99,102,241,.28)] hover:brightness-110' })}>
              Criar meu primeiro funil
              <ArrowRight className="size-4" />
            </Link>
            <div className="flex items-center gap-2 px-2 text-xs text-zinc-500">
              <Check className="size-4 text-emerald-400" />
              Sem cartão para começar
            </div>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, description }) => (
              <article key={title} className="group rounded-2xl border border-white/[.07] bg-white/[.025] p-4 backdrop-blur-sm transition hover:border-violet-400/20 hover:bg-white/[.045]">
                <Icon className="size-4.5 text-violet-400 transition group-hover:text-cyan-300" />
                <h2 className="mt-3 text-sm font-bold text-zinc-100">{title}</h2>
                <p className="mt-1.5 text-xs leading-5 text-zinc-500">{description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
          <div className="absolute inset-8 rounded-[2.5rem] bg-violet-600/20 blur-[80px]" />
          <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#0c0d14]/95 shadow-[0_45px_100px_rgba(0,0,0,.55)]">
            <div className="flex h-12 items-center justify-between border-b border-white/[.07] px-4">
              <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-400/70" /><span className="size-2 rounded-full bg-amber-300/70" /><span className="size-2 rounded-full bg-emerald-400/70" /></div>
              <span className="rounded-md bg-white/[.04] px-3 py-1 text-[9px] font-semibold uppercase tracking-[.16em] text-zinc-500">Design · Desktop</span>
              <div className="flex items-center gap-1 text-zinc-600"><MousePointer2 className="size-3.5" /><span className="text-[9px]">87%</span></div>
            </div>

            <div className="grid min-h-[450px] grid-cols-[74px_1fr_90px] sm:grid-cols-[148px_1fr_146px]">
              <aside className="border-r border-white/[.06] p-2.5 sm:p-3">
                <p className="hidden text-[8px] font-bold uppercase tracking-[.2em] text-zinc-600 sm:block">Componentes</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {['Seção', 'Container', 'Título', 'Texto', 'Imagem', 'Botão', 'E-mail', 'Quiz'].map((item, index) => (
                    <div key={item} className="rounded-lg border border-white/[.07] bg-white/[.025] p-2 text-center sm:text-left">
                      <Blocks className={`mx-auto size-3.5 ${index === 0 ? 'text-violet-400' : 'text-zinc-600'} sm:mx-0`} />
                      <span className="mt-1.5 hidden text-[8px] font-semibold text-zinc-400 sm:block">{item}</span>
                    </div>
                  ))}
                </div>
              </aside>

              <div className="relative overflow-hidden bg-[linear-gradient(rgba(255,255,255,.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.022)_1px,transparent_1px)] bg-[size:28px_28px] p-3 sm:p-6">
                <div className="rounded-xl border border-violet-400/50 bg-[#090a0f] p-5 text-center shadow-[0_0_0_2px_rgba(139,92,246,.08)] sm:p-8">
                  <span className="text-[8px] uppercase tracking-[.15em] text-violet-300">Diagnóstico gratuito</span>
                  <p className="mx-auto mt-4 max-w-xs text-lg font-extrabold leading-tight text-white sm:text-2xl">Descubra o próximo passo do seu crescimento</p>
                  <p className="mx-auto mt-3 max-w-xs text-[9px] leading-4 text-zinc-500 sm:text-[11px]">Responda algumas perguntas e receba um plano personalizado.</p>
                  <button className="mt-5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-[9px] font-bold text-white">COMEÇAR AGORA</button>
                  <div className="mt-7 rounded-xl border border-dashed border-white/10 bg-white/[.02] px-4 py-7 text-[9px] text-zinc-600">Solte um elemento aqui</div>
                </div>
              </div>

              <aside className="border-l border-white/[.06] p-2.5 sm:p-3">
                <p className="text-[8px] font-bold uppercase tracking-[.16em] text-zinc-600">Inspector</p>
                <div className="mt-4 flex gap-2 border-b border-white/[.06] pb-2 text-[7px] text-zinc-600 sm:gap-3"><span className="text-violet-300">Conteúdo</span><span>Estilo</span><span>Lógica</span></div>
                <div className="mt-4 space-y-3"><div className="h-7 rounded-md border border-white/[.06] bg-white/[.025]" /><div className="h-12 rounded-md border border-white/[.06] bg-white/[.025]" /><div className="grid grid-cols-2 gap-2"><div className="h-7 rounded-md border border-white/[.06] bg-white/[.025]" /><div className="h-7 rounded-md border border-white/[.06] bg-white/[.025]" /></div></div>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
