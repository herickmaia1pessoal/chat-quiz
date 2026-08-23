'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

function readCredentials(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')

  if (!email || !email.includes('@')) {
    redirect('/login?error=Informe%20um%20e-mail%20válido')
  }

  if (password.length < 6 || password.length > 128) {
    redirect('/login?error=A%20senha%20deve%20ter%20entre%206%20e%20128%20caracteres')
  }

  return { email, password }
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = readCredentials(formData)

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const data = readCredentials(formData)

  const { data: signupData, error } = await supabase.auth.signUp(data)

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  if (!signupData.session) {
    const message = 'Conta criada. Confirme seu e-mail para entrar.'
    redirect(`/login?message=${encodeURIComponent(message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
