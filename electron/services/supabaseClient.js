const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const SUPABASE_AUTH_DOMAIN = process.env.SUPABASE_AUTH_DOMAIN || 'gestordesk.local'

let cached = {
  client: null,
  sessionExpiresAt: 0,
  login: '',
  senha: '',
}

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

function setSupabaseAuthFromAppLogin(login, senha) {
  cached.login = String(login || '').trim()
  cached.senha = String(senha || '')
  // força reauth na próxima chamada
  cached.client = null
  cached.sessionExpiresAt = 0
}

function getEmailFromLogin(login) {
  const safe = String(login || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')
  return `${safe}@${SUPABASE_AUTH_DOMAIN}`
}

async function getAuthedSupabaseClient() {
  if (!isConfigured()) {
    return { client: null, error: 'Supabase não configurado (SUPABASE_URL, SUPABASE_ANON_KEY).' }
  }

  if (!cached.login || !cached.senha) {
    return { client: null, error: 'Supabase não autenticado. Faça login no GestorDesk para habilitar a sincronização.' }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  // Renova 60s antes de expirar
  if (cached.client && cached.sessionExpiresAt && cached.sessionExpiresAt - 60 > nowSec) {
    return { client: cached.client, error: null }
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const email = getEmailFromLogin(cached.login)
  const password = cached.senha

  // Tenta apenas login.
  // Evitamos signUp automático aqui para não disparar fluxo de e-mail do Supabase
  // e cair em limite de envio ("email rate limit exceeded") durante tentativas de sync.
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    return { client: null, error: error?.message || 'Falha ao autenticar no Supabase.' }
  }

  if (!data?.session) {
    return { client: null, error: 'Falha ao autenticar no Supabase.' }
  }

  cached = {
    ...cached,
    client,
    sessionExpiresAt: data.session.expires_at || 0,
  }

  return { client, error: null }
}

module.exports = { getAuthedSupabaseClient, isConfigured, setSupabaseAuthFromAppLogin }

