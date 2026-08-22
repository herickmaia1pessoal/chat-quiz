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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950"></div>
      <Card className="z-10 w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
            Acessar Plataforma
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Entre com seu email para acessar seus quizzes
          </CardDescription>
        </CardHeader>
        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <form>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">Email</Label>
              <Input 
                id="email" 
                name="email" 
                type="email" 
                placeholder="nome@empresa.com" 
                required 
                className="border-zinc-800 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">Senha</Label>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                required 
                className="border-zinc-800 bg-zinc-950/50 text-zinc-100"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <LoginButtons loginAction={login} signupAction={signup} />
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
