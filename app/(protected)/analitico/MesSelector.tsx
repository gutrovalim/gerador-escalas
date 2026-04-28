"use client"

import { useRouter } from "next/navigation"
import {
  mesAnteriorReferencia,
  mesSeguinteReferencia,
  primeiroMesReferencia,
  ultimoMesReferencia,
} from "@/lib/mes"

const btnNavegacao =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gh-border bg-gh-surface-2 text-gh-text hover:bg-gh-surface-2/80 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gh-accent/50"

export function MesSelector({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  const noInicio = mesAtual <= primeiroMesReferencia()
  const noFim = mesAtual >= ultimoMesReferencia()

  function irPara(ym: string) {
    router.push(`/analitico?mes=${ym}`)
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium text-gh-muted uppercase tracking-wide">Mês de referência</span>
      <div className="inline-flex max-w-full items-center gap-2">
        <button
          type="button"
          className={btnNavegacao}
          disabled={noInicio}
          onClick={() => irPara(mesAnteriorReferencia(mesAtual))}
          aria-label="Mês anterior"
        >
          <span className="text-lg leading-none" aria-hidden>
            ‹
          </span>
        </button>
        <input
          type="month"
          value={mesAtual}
          onChange={e => {
            const v = e.target.value
            if (v) irPara(v)
          }}
          min={primeiroMesReferencia()}
          max={ultimoMesReferencia()}
          className="min-h-9 bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent w-[min(100%,14rem)] box-border"
        />
        <button
          type="button"
          className={btnNavegacao}
          disabled={noFim}
          onClick={() => irPara(mesSeguinteReferencia(mesAtual))}
          aria-label="Mês seguinte"
        >
          <span className="text-lg leading-none" aria-hidden>
            ›
          </span>
        </button>
      </div>
    </label>
  )
}
