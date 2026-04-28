"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) {
        setErro("E-mail ou senha incorretos.")
      } else {
        router.push("/escalas")
        router.refresh()
      }
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gh-bg">
      <div className="bg-gh-surface border border-gh-border rounded-xl p-8 w-full max-w-sm shadow-lg">
        <div className="flex items-center justify-center mb-6">
          <div className="w-8 h-8 rounded-full bg-gh-accent/20 flex items-center justify-center mr-3">
            <span className="text-gh-accent text-sm font-bold">E</span>
          </div>
          <h1 className="text-xl font-semibold text-gh-text">Gerador de Escalas</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text placeholder-gh-muted focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
              placeholder="lider@ministerio.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide">
              Senha
            </label>
            <input
              type="password"
              required
              value={senha}
              onChange={e => setSenha(e.target.value)}
              className="w-full bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text placeholder-gh-muted focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
            />
          </div>

          {erro && (
            <div className="border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-3 py-2 text-sm text-gh-red">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-gh-accent text-white rounded-lg py-2 text-sm font-medium hover:bg-[#1f6feb] disabled:opacity-50 transition-colors"
          >
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
