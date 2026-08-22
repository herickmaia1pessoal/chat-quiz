import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Sparkles, Zap, Shield, BarChart3 } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { buttonVariants } from '@/components/ui/button'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-indigo-600/20 via-cyan-500/15 to-transparent blur-[120px] pointer-events-none rounded-full"></div>

      {/* Header */}
      <header className="max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
            QuizFlow
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className={buttonVariants({
              variant: 'outline',
              className: 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800',
            })}
          >
            Entrar
          </Link>
          <Link
            href="/login"
            className={buttonVariants({
              className: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20',
            })}
          >
            Criar Conta Grátis
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 py-16 text-center space-y-8 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-300 text-xs font-medium backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Feito para Estrategistas de Tráfego & Growth
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Quizzes Interativos de Alta Conversão com Coleta de{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
            First-Party Data
          </span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          Reduza seu CPL em campanhas de Meta Ads com funis interativos. Injeção nativa de Pixels, captura de UTMs e envio instantâneo de leads via Webhooks (n8n / Evolution API).
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/login"
            className={buttonVariants({
              size: 'lg',
              className: 'w-full sm:w-auto h-12 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xl shadow-indigo-500/25 gap-2 text-base',
            })}
          >
            Começar Agora
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-12 text-left">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 backdrop-blur-xl space-y-2">
            <Zap className="h-5 w-5 text-indigo-400" />
            <h3 className="font-semibold text-zinc-100 text-sm">Ultra-rápido & Mobile First</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Carregamento instantâneo no Next.js para maximizar a retenção do tráfego pago.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 backdrop-blur-xl space-y-2">
            <Shield className="h-5 w-5 text-cyan-400" />
            <h3 className="font-semibold text-zinc-100 text-sm">Rastreamento & UTMs</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Armazena todos os parâmetros de campanha e dispara eventos padrão do Meta Pixel.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 backdrop-blur-xl space-y-2">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
            <h3 className="font-semibold text-zinc-100 text-sm">Webhooks em Tempo Real</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Envio imediato dos leads e respostas para n8n, Typebot ou seu CRM favorito.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto w-full px-6 py-8 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4 z-10">
        <div>© 2026 QuizFlow SaaS. Todos os direitos reservados.</div>
        <div className="flex items-center gap-6">
          <span>Multi-tenant & RLS Supabase</span>
        </div>
      </footer>
    </div>
  )
}
