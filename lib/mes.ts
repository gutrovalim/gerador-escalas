/** Nomes dos meses em português (ordem Janeiro…Dezembro). */
export const MESES_PT_NOMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

/** `YYYY-MM` → título em português, ex.: `Abril de 2026` */
export function mesReferenciaTituloPt(ym: string): string {
  if (!ym || ym.length < 7) return ym
  const [y, mo] = ym.split("-")
  if (!y || !mo) return ym
  const mi = parseInt(mo, 10) - 1
  if (mi < 0 || mi > 11) return ym
  return `${MESES_PT_NOMES[mi]} de ${y}`
}

/**
 * Mês de referência padrão (`YYYY-MM`) para telas com seletor de mês:
 * mês civil corrente, exceto nos **últimos 7 dias** do mês — aí usa o **mês seguinte**
 * (útil para quem já planifica o mês que se aproxima).
 */
export function mesReferenciaPadrao(): string {
  const d = new Date()
  const y = d.getFullYear()
  const monthIndex = d.getMonth()
  const day = d.getDate()
  const ultimoDiaDoMes = new Date(y, monthIndex + 1, 0).getDate()
  const naUltimaSemana = day >= ultimoDiaDoMes - 6
  if (naUltimaSemana) {
    const prox = new Date(y, monthIndex + 1, 1)
    return `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}`
  }
  return `${y}-${String(monthIndex + 1).padStart(2, "0")}`
}

/** Intervalo de anos para o seletor de mês (referência ± janela). */
export function anoMinMaxReferencia(): [number, number] {
  const y = new Date().getFullYear()
  return [y - 1, y + 3]
}

/** Primeiro mês válido no seletor de referência (`YYYY-MM`). */
export function primeiroMesReferencia(): string {
  const [min] = anoMinMaxReferencia()
  return `${min}-01`
}

/** Último mês válido no seletor de referência (`YYYY-MM`). */
export function ultimoMesReferencia(): string {
  const [, max] = anoMinMaxReferencia()
  return `${max}-12`
}

/** Mês anterior em `YYYY-MM`, limitado ao intervalo do seletor. */
export function mesAnteriorReferencia(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym
  const [y, mo] = ym.split("-").map(Number)
  const d = new Date(y, mo - 2, 1)
  const out = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const min = primeiroMesReferencia()
  const max = ultimoMesReferencia()
  if (out < min) return min
  if (out > max) return max
  return out
}

/** Mês seguinte em `YYYY-MM`, limitado ao intervalo do seletor. */
export function mesSeguinteReferencia(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym
  const [y, mo] = ym.split("-").map(Number)
  const d = new Date(y, mo, 1)
  const out = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const min = primeiroMesReferencia()
  const max = ultimoMesReferencia()
  if (out < min) return min
  if (out > max) return max
  return out
}

/** Opções para `<select>` de mês/ano com rótulos em português. */
export function opcoesMesAnoReferenciaPt(anoMin: number, anoMax: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  for (let y = anoMin; y <= anoMax; y++) {
    for (let mi = 0; mi < 12; mi++) {
      const m = String(mi + 1).padStart(2, "0")
      const value = `${y}-${m}`
      out.push({ value, label: `${MESES_PT_NOMES[mi]} de ${y}` })
    }
  }
  return out
}

/** `mes` no formato `YYYY-MM`. Retorna o último dia do mês como `YYYY-MM-DD`. */
export function ultimoDiaDoMesISO(mes: string): string {
  const [y, m] = mes.split("-").map(Number)
  if (!y || !m) return `${mes}-01`
  const ultimo = new Date(y, m, 0).getDate()
  return `${mes}-${String(ultimo).padStart(2, "0")}`
}

/** Todas as datas de domingo (`YYYY-MM-DD`) dentro do mês `YYYY-MM`. */
export function domingosDoMesISO(mes: string): string[] {
  const [ano, mesNum] = mes.split("-").map(Number)
  if (!ano || !mesNum) return []
  const domingos: string[] = []
  const dias = new Date(ano, mesNum, 0).getDate()
  for (let d = 1; d <= dias; d++) {
    if (new Date(ano, mesNum - 1, d).getDay() === 0) {
      domingos.push(`${String(ano).padStart(4, "0")}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
    }
  }
  return domingos
}

/** Normaliza `date` / string do Supabase para `YYYY-MM-DD`. */
export function dataIsoDia(v: unknown): string {
  if (v == null) return ""
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

/** União ordenada de datas `YYYY-MM-DD` (sem duplicar). */
export function unirDatasOrdenadas(...grupos: string[][]): string[] {
  const set = new Set<string>()
  for (const g of grupos) {
    for (const d of g) {
      const x = dataIsoDia(d)
      if (x) set.add(x)
    }
  }
  return [...set].sort()
}
