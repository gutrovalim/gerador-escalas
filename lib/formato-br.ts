/**
 * `YYYY-MM-DD` → exibição **dd/mm/aaaa** (Brasil)
 */
export function dataIsoParaExibicao(iso: string | null | undefined): string {
  if (iso == null || iso === "") return ""
  const s = iso.length >= 10 ? iso.slice(0, 10) : String(iso)
  const p = s.split("-")
  if (p.length < 3) return String(iso)
  const [y, m, d] = p
  if (y == null || m == null || d == null) return s
  return `${d!.padStart(2, "0")}/${m!.padStart(2, "0")}/${y!}`
}

/**
 * `YYYY-MM-DD` → **dd/mm** (sem ano), para cabeçalhos de coluna na escala.
 */
export function dataIsoDiaMesSomente(iso: string | null | undefined): string {
  if (iso == null || iso === "") return ""
  const s = iso.length >= 10 ? iso.slice(0, 10) : String(iso)
  const p = s.split("-")
  if (p.length < 3) return String(iso)
  const [, m, d] = p
  if (m == null || d == null) return s
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}`
}

/**
 * `YYYY-MM` (referência de mês) → `mm/aaaa` (ex.: `04/2026`)
 */
export function refAnoMesParaExibicao(ym: string): string {
  if (!ym || ym.length < 7) return ym
  const p = ym.split("-")
  if (p.length < 2) return ym
  const [a0, a1] = p
  if (a0 == null || a1 == null) return ym
  return `${a1}/${a0}`
}

import { mesReferenciaTituloPt } from "./mes"

/**
 * `YYYY-MM` (mês de referência) → título em português (ex.: `Abril de 2026`)
 */
export function mesAnoRefParaExibicao(ym: string): string {
  return mesReferenciaTituloPt(ym)
}

/**
 * Time do Postgres (`HH:MM:SS` ou `HH:MM`) → `HH:MM` sem segundos
 */
export function horaBancoParaExibicao(t: string | null | undefined): string {
  if (t == null || t === "") return ""
  const s = String(t).trim()
  const p = s.split(":")
  if (p.length < 2) return s
  return `${p[0]!.padStart(2, "0")}:${p[1]!.padStart(2, "0")}`
}

/** Exibição de intervalo para evento: `HH:MM` ou `HH:MM–HH:MM`. */
export function intervaloHorarioEvento(
  inicio: string | null | undefined,
  fim: string | null | undefined,
): string {
  const hi = horaBancoParaExibicao(inicio)
  const hf = horaBancoParaExibicao(fim)
  if (hi && hf) return `${hi}–${hf}`
  return hi || hf || ""
}

/** Normaliza valor inicial de `<input type="time" step="60">` */
export function horaBancoParaInputTime(t: string | null | undefined): string {
  return horaBancoParaExibicao(t)
}

/**
 * Instantaneamente ISO (gerada_em etc.) → `dd/mm/aaaa hh:mm` (24h, sem segundos)
 */
export function dataHoraIsoParaExibicao(iso: string | null | undefined): string {
  if (iso == null || iso === "") return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const data = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${data} ${hora}`
}
