"use client"

import { useMemo } from "react"
import {
  anoMinMaxReferencia,
  mesAnteriorReferencia,
  mesReferenciaPadrao,
  mesSeguinteReferencia,
  opcoesMesAnoReferenciaPt,
  primeiroMesReferencia,
  ultimoMesReferencia,
} from "@/lib/mes"

type Props = {
  value: string
  onChange: (ym: string) => void
  className?: string
  disabled?: boolean
  /** Inclui opção vazia (ex.: “Todos os meses”) */
  allowEmpty?: boolean
  emptyLabel?: string
  "aria-label"?: string
}

const btnNavegacao =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gh-border bg-gh-surface-2 text-gh-text hover:bg-gh-surface-2/80 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gh-accent/50"

/**
 * Seleção de mês/ano com rótulos em português (`Janeiro de 2026`, …) e setas mês anterior/seguinte.
 * Valor: `YYYY-MM` ou `""` quando `allowEmpty`.
 */
export function MesPicker({
  value,
  onChange,
  className = "",
  disabled = false,
  allowEmpty = false,
  emptyLabel = "Todos os meses",
  "aria-label": ariaLabel,
}: Props) {
  const [anoMin, anoMax] = anoMinMaxReferencia()
  const opcoes = useMemo(() => {
    const base = opcoesMesAnoReferenciaPt(anoMin, anoMax)
    if (allowEmpty) return [{ value: "", label: emptyLabel }, ...base]
    return base
  }, [allowEmpty, emptyLabel, anoMin, anoMax])

  const valid = Boolean(value && /^\d{4}-\d{2}$/.test(value))
  const fallback = mesReferenciaPadrao()
  const selectValue = allowEmpty ? (valid ? value : "") : valid ? value : fallback

  const ymNavegacao = valid ? value : mesReferenciaPadrao()
  const noInicio = ymNavegacao <= primeiroMesReferencia()
  const noFim = ymNavegacao >= ultimoMesReferencia()

  return (
    <div className="inline-flex max-w-full items-center gap-2">
      <button
        type="button"
        className={btnNavegacao}
        disabled={disabled || noInicio}
        onClick={() => onChange(mesAnteriorReferencia(ymNavegacao))}
        aria-label="Mês anterior"
      >
        <span className="text-lg leading-none" aria-hidden>
          ‹
        </span>
      </button>
      <select
        value={selectValue}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={className}
        aria-label={ariaLabel}
      >
        {opcoes.map(o => (
          <option key={o.value || "__vazio"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={btnNavegacao}
        disabled={disabled || noFim}
        onClick={() => onChange(mesSeguinteReferencia(ymNavegacao))}
        aria-label="Mês seguinte"
      >
        <span className="text-lg leading-none" aria-hidden>
          ›
        </span>
      </button>
    </div>
  )
}
