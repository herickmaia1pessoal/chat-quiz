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
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        {isLoggingIn ? 'Entrando...' : 'Entrar'}
      </Button>
      <Button
        formAction={signupAction}
        disabled={pending}
        variant="outline"
        className="w-full border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      >
        {isSigningUp ? 'Criando conta...' : 'Criar nova conta'}
      </Button>
    </>
  )
}
