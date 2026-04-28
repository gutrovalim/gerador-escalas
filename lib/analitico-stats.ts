import type { SupabaseClient } from "@supabase/supabase-js"
import { mesReferenciaPadrao } from "@/lib/mes"

/** Formato YYYY-MM; reexporta a mesma regra de {@link mesReferenciaPadrao}. */
export function mesAtualPadrao(): string {
  return mesReferenciaPadrao()
}

/** Valida ou devolve o mês padrão da aplicação (YYYY-MM). */
export function normalizarMesParam(mes: string | undefined): string {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number)
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return mes
  }
  return mesReferenciaPadrao()
}

/** Primeiro e último dia do mês (YYYY-MM-DD), para filtros `data` em colunas date. */
export function limitesMes(mesRef: string): { inicio: string; fim: string } {
  const [y, mo] = mesRef.split("-").map(Number)
  const ultimo = new Date(y, mo, 0).getDate()
  return {
    inicio: `${mesRef}-01`,
    fim: `${mesRef}-${String(ultimo).padStart(2, "0")}`,
  }
}

export type EscalasMesResultado = {
  /** Soma cultos + eventos no intervalo, ou linhas em `escalas` se for o fallback. */
  total: number
  /** Como o total foi obtido (para depuração / UI técnica). */
  modo: "cultos_mais_eventos" | "escalas_fallback"
}

/**
 * Conta ocorrências no mês: soma contagens de `cultos` e `eventos` com coluna `data`.
 * Se ambas as tabelas falharem (nomes/colunas diferentes), tenta só `escalas.data` no mesmo intervalo.
 */
export async function contarEscalasNoMes(
  supabase: SupabaseClient,
  inicio: string,
  fim: string
): Promise<EscalasMesResultado> {
  const [cultos, eventos] = await Promise.all([
    supabase.from("cultos").select("id", { count: "exact", head: true }).gte("data", inicio).lte("data", fim),
    supabase.from("eventos").select("id", { count: "exact", head: true }).eq("ativo", true).gte("data", inicio).lte("data", fim),
  ])

  const cOk = !cultos.error
  const eOk = !eventos.error

  if (cOk || eOk) {
    return {
      total: (cOk ? cultos.count ?? 0 : 0) + (eOk ? eventos.count ?? 0 : 0),
      modo: "cultos_mais_eventos",
    }
  }

  const esc = await supabase
    .from("escalas")
    .select("id", { count: "exact", head: true })
    .gte("data", inicio)
    .lte("data", fim)

  if (!esc.error) {
    return { total: esc.count ?? 0, modo: "escalas_fallback" }
  }

  return { total: 0, modo: "escalas_fallback" }
}
