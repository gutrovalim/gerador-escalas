import { createClient } from "@/lib/supabase/server"
import { dataIsoDia, mesReferenciaPadrao, ultimoDiaDoMesISO } from "@/lib/mes"
import { primeiroValorQuery } from "@/lib/search-params"
import type { Evento, MinisterioSlug } from "@/lib/scheduler/types"
import { EscalasClient } from "./client"

export default async function EscalasPage({ searchParams }: PageProps<"/escalas">) {
  const sp = await searchParams
  const mesParam = primeiroValorQuery(sp.mes)
  const minParam = primeiroValorQuery(sp.ministerio)
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesReferenciaPadrao()
  const ministerio =
    minParam === "tecnica" || minParam === "backstage" ? minParam : "backstage"

  const supabase = await createClient()

  const inicioMes = `${mes}-01`
  const fimMes = ultimoDiaDoMesISO(mes)

  const [
    { data: escala },
    { data: escalasMesRows },
    { data: voluntarios },
    { data: historico },
    { data: eventosMes },
    { data: ausenciasMes },
  ] = await Promise.all([
    supabase
      .from("escalas")
      .select("id, gerada_em, alertas")
      .eq("mes", mes)
      .eq("ministerio", ministerio)
      .maybeSingle(),
    supabase.from("escalas").select("ministerio").eq("mes", mes),
    supabase
      .from("voluntarios")
      .select("id, nome, ministerio, papeis, treinamento, ativo")
      .eq("ministerio", ministerio),
    supabase
      .from("escalas")
      .select("id, mes, ministerio, gerada_em")
      .order("mes", { ascending: false })
      .limit(20),
    supabase
      .from("eventos")
      .select("id, nome, data, horario_inicio, horario_fim, ministerios, papeis")
      .eq("ativo", true)
      .gte("data", inicioMes)
      .lte("data", fimMes),
    supabase
      .from("indisponibilidades")
      .select("voluntario_id, data, turnos")
      .gte("data", inicioMes)
      .lte("data", fimMes),
  ])

  let cultos: Record<string, unknown>[] = []
  if (escala) {
    const { data: alocacoes } = await supabase
      .from("alocacoes")
      .select("*")
      .eq("escala_id", escala.id)
    cultos = alocacoes ?? []
  }

  const ministeriosComEscalaNoMes = Array.from(
    new Set(
      (escalasMesRows ?? [])
        .map(r => r.ministerio as string)
        .filter(m => m === "tecnica" || m === "backstage"),
    ),
  )

  const eventosPorDataNome: Record<string, { horario_inicio: string; horario_fim: string | null }> = {}
  for (const ev of eventosMes ?? []) {
    const data = dataIsoDia(ev.data)
    const nome = String((ev as { nome?: string }).nome ?? "")
    eventosPorDataNome[`${data}|${nome}`] = {
      horario_inicio: String((ev as { horario_inicio?: string }).horario_inicio ?? ""),
      horario_fim: ((ev as { horario_fim?: string | null }).horario_fim as string | null) ?? null,
    }
  }

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
    <EscalasClient
      mes={mes}
      ministerio={ministerio}
      ministeriosComEscalaNoMes={ministeriosComEscalaNoMes}
      escala={escala ?? null}
      alocacoesRaw={cultos}
      eventosCalendario={eventosCalendario}
      voluntarios={voluntarios ?? []}
      historico={historico ?? []}
      eventosPorDataNome={eventosPorDataNome}
      ausencias={ausenciasMes ?? []}
    />
  )
}
