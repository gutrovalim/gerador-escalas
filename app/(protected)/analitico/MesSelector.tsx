"use client"

import { useRouter } from "next/navigation"

export function MesSelector({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium text-gh-muted uppercase tracking-wide">Mês de referência</span>
      <input
        type="month"
        value={mesAtual}
        onChange={e => {
          const v = e.target.value
          if (v) router.push(`/analitico?mes=${v}`)
        }}
        className="bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent w-[min(100%,14rem)]"
      />
    </label>
  )
}
