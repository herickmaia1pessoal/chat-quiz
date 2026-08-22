import { AlertCircle } from 'lucide-react'
import { login, signup } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginButtons } from '@/components/login/login-buttons'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 p-4">
      {/* Background Orbs */}
      <div className="absolute left-1/2 top-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/20 blur-[120px]"></div>
      <div className="absolute left-1/4 top-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[100px]"></div>

      <div className="z-10 w-full max-w-md">
        {/* Logo/Brand Area */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/25">
            <svg 
              className="h-7 w-7 text-white" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            QuizFlow
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Acesse seu painel para gerenciar seus quizzes
          </p>
        </div>

        {/* Login Card */}
        <Card className="border border-white/10 bg-zinc-900/60 shadow-2xl shadow-black/40 backdrop-blur-xl sm:rounded-3xl">
          <CardHeader className="pb-4 pt-8 text-center">
            <CardTitle className="text-xl font-semibold text-zinc-100">
              Bem-vindo de volta
            </CardTitle>
          </CardHeader>

          {error && (
            <div className="mx-6 mb-2 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form>
            <CardContent className="space-y-5 px-6 pb-6">
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Email
                </Label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  placeholder="nome@empresa.com" 
                  required 
                  className="h-11 rounded-xl border-zinc-800 bg-zinc-950/50 px-4 text-sm text-zinc-100 transition-colors hover:bg-zinc-950/80 focus:border-indigo-500/50 focus:bg-zinc-950/80 focus:ring-1 focus:ring-indigo-500/50 placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Senha
                </Label>
                <Input 
                  id="password" 
                  name="password" 
                  type="password" 
                  required 
                  className="h-11 rounded-xl border-zinc-800 bg-zinc-950/50 px-4 text-sm text-zinc-100 transition-colors hover:bg-zinc-950/80 focus:border-indigo-500/50 focus:bg-zinc-950/80 focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 px-6 pb-8">
              <LoginButtons loginAction={login} signupAction={signup} />
            </CardFooter>
          </form>
        </Card>
        
        {/* Footer Link */}
        <p className="mt-8 text-center text-xs text-zinc-500">
          Problemas para acessar? <a href="#" className="text-indigo-400 hover:text-indigo-300 hover:underline">Fale com o suporte</a>
        </p>
      </div>
    </div>
  )
}
