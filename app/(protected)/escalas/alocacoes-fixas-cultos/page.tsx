import { createClient } from "@/lib/supabase/server"
import { dataIsoDia, mesReferenciaPadrao, ultimoDiaDoMesISO } from "@/lib/mes"
import { primeiroValorQuery } from "@/lib/search-params"
import type { Evento, MinisterioSlug } from "@/lib/scheduler/types"
import { FixasCultoClient } from "./client"

export default async function AlocacoesFixasCultosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ministerio?: string }>
}) {
  const sp = await searchParams
  const mesParam = primeiroValorQuery(sp.mes)
  const minParam = primeiroValorQuery(sp.ministerio)
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesReferenciaPadrao()
  const ministerio: MinisterioSlug =
    minParam === "tecnica" || minParam === "backstage" ? minParam : "tecnica"

  const supabase = await createClient()
  const inicioMes = `${mes}-01`
  const fimMes = ultimoDiaDoMesISO(mes)

  const [{ data: eventosMes }, { data: voluntarios }, { data: fixasRows }] = await Promise.all([
    supabase
      .from("eventos")
      .select("id, nome, data, horario_inicio, horario_fim, ministerios, papeis")
      .eq("ativo", true)
      .gte("data", inicioMes)
      .lte("data", fimMes),
    supabase
      .from("voluntarios")
      .select("id, nome, ministerio, papeis, ativo")
      .eq("ministerio", ministerio)
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("alocacoes_fixas_culto")
      .select("*")
      .eq("mes", mes)
      .eq("ministerio", ministerio),
  ])

  const eventosCalendario: Evento[] = (eventosMes ?? []).map(ev => {
    const row = ev as Record<string, unknown>
    const ministerios = (Array.isArray(row.ministerios) ? row.ministerios : []) as MinisterioSlug[]
    const papeisRaw = row.papeis
    return {
      id: String(row.id ?? ""),
      nome: String(row.nome ?? ""),
      data: dataIsoDia(row.data),
      horario_inicio: String(row.horario_inicio ?? "10:00"),
      horario_fim: (row.horario_fim as string | undefined) ?? undefined,
      ministerios,
      papeis: Array.isArray(papeisRaw) ? (papeisRaw as Evento["papeis"]) : undefined,
    }
  })

  return (
    <FixasCultoClient
      mes={mes}
      ministerio={ministerio}
      eventosCalendario={eventosCalendario}
      voluntarios={voluntarios ?? []}
      fixasInicial={(fixasRows ?? []) as Array<Record<string, unknown>>}
    />
  )
}
