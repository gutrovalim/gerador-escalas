"use client"

import Link from "next/link"
import { useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ConfirmDialog"

const LINKS = [
  { href: "/escalas", label: "Escalas" },
  { href: "/voluntarios", label: "Voluntários" },
  { href: "/indisponibilidades", label: "Ausências" },
  { href: "/eventos", label: "Eventos" },
  { href: "/analitico", label: "Analítico" },
  { href: "/configuracoes", label: "Configurações" },
]

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { confirm, dialog } = useConfirm()

  async function handleLogout() {
    const ok = await confirm({
      title: "Terminar sessão?",
      description: "Tem a certeza que pretende sair?",
      confirmLabel: "Sair",
      variant: "danger",
    })
    if (!ok) return
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <nav className="bg-gh-surface border-b border-gh-border px-6 py-0 flex items-center gap-1">
      <Link
        href="/escalas"
        className="mr-4 py-3 inline-flex items-center text-gh-text hover:text-gh-text/90 transition-colors font-extrabold text-lg leading-tight tracking-tight"
        aria-label="onda. — Escalas"
      >
        <span>onda.</span>
      </Link>
      {LINKS.map(({ href, label }) => {
        const ativo = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`text-sm px-3 py-3 border-b-2 transition-colors ${
              ativo
                ? "border-gh-accent text-gh-accent font-medium"
                : "border-transparent text-gh-muted hover:text-gh-text"
            }`}
          >
            {label}
          </Link>
        )
      })}
      <button
        type="button"
        onClick={() => void handleLogout()}
        className="ml-auto text-sm text-gh-muted hover:text-gh-red transition-colors py-3"
      >
        Sair
      </button>
      {dialog}
    </nav>
  )
}
