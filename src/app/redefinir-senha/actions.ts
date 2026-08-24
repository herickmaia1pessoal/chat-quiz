'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const message = 'Sua sessão de redefinição expirou. Solicite um novo link.'
    redirect(`/login/esqueci-senha?error=${encodeURIComponent(message)}`)
  }

  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirmPassword') || '')

  if (password.length < 6 || password.length > 128) {
    redirect('/redefinir-senha?error=A%20senha%20deve%20ter%20entre%206%20e%20128%20caracteres')
  }

  if (password !== confirmPassword) {
    redirect('/redefinir-senha?error=As%20senhas%20não%20coincidem')
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect(`/redefinir-senha?error=${encodeURIComponent(error.message)}`)
  }

  // Sign out of the one-time recovery session so the next visit to
  // /dashboard goes through a normal login with the new password, rather
  // than silently staying signed in on whatever device opened the reset
  // link (which may not be the person's own).
  await supabase.auth.signOut()

  const message = 'Senha redefinida com sucesso. Entre com sua nova senha.'
  redirect(`/login?message=${encodeURIComponent(message)}`)
}
