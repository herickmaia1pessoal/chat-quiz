'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

// Server Actions triggered via `formAction` don't give the parent Server
// Component any pending state to disable the buttons with — without this,
// a slow network lets a user mash "Entrar" repeatedly and fire several
// concurrent sign-in attempts. `useFormStatus` (must live in a client child
// of the <form>) reports the pending state of whichever action is submitting.
export function LoginButtons({
  loginAction,
  signupAction,
}: {
  loginAction: (formData: FormData) => void
  signupAction: (formData: FormData) => void
}) {
  const { pending, action } = useFormStatus()
  const isLoggingIn = pending && action === loginAction
  const isSigningUp = pending && action === signupAction

  return (
    <>
      <Button
        formAction={loginAction}
        disabled={pending}
        className="h-11 w-full border-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 font-bold text-white shadow-[0_12px_35px_rgba(99,102,241,.2)] hover:brightness-110"
      >
        {isLoggingIn ? 'Entrando...' : 'Entrar'}
      </Button>
      <Button
        formAction={signupAction}
        disabled={pending}
        variant="outline"
        className="h-11 w-full border-border bg-muted/25 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {isSigningUp ? 'Criando conta...' : 'Criar nova conta'}
      </Button>
    </>
  )
}
