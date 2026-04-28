import { createClient } from "@/lib/supabase/server"
import { dataIsoDia, domingosDoMesISO, mesReferenciaPadrao, ultimoDiaDoMesISO } from "@/lib/mes"
import { primeiroValorQuery } from "@/lib/search-params"
import { AusenciasOverviewClient } from "./client"
import type { ColunaAusencia } from "./types"

export default async function IndisponibilidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ministerio?: string }>
}) {
  const sp = await searchParams
  const mesRaw = primeiroValorQuery(sp.mes) ?? mesReferenciaPadrao()
  const mes = /^\d{4}-\d{2}$/.test(mesRaw) ? mesRaw : mesReferenciaPadrao()
  const ministerioRaw = primeiroValorQuery(sp.ministerio) ?? "todos"
  const ministerio =
    ministerioRaw === "tecnica" || ministerioRaw === "backstage" || ministerioRaw === "todos"
      ? ministerioRaw
      : "todos"

  const supabase = await createClient()
  const inicio = `${mes}-01`
  const fim = ultimoDiaDoMesISO(mes)

  let qVol = supabase
    .from("voluntarios")
    .select("id, nome, ministerio, ativo")
    .eq("ativo", true)
    .order("nome")
  if (ministerio !== "todos") {
    qVol = qVol.eq("ministerio", ministerio)
  }

  const [{ data: voluntarios }, { data: ausenciasRows }, { data: eventosRows }] = await Promise.all([
    qVol,
    supabase.from("indisponibilidades").select("*").gte("data", inicio).lte("data", fim),
    supabase
      .from("eventos")
      .select("id, nome, data, horario_inicio, horario_fim, ministerios, papeis")
      .eq("ativo", true)
      .gte("data", inicio)
      .lte("data", fim),
  ])

  const domingos = domingosDoMesISO(mes)

  type RowEvt = { id: string; nome: string; data: unknown; horario_inicio?: unknown }
  const eventosLista = (eventosRows ?? []).map(r => {
    const row = r as Record<string, unknown>
    return {
      id: String(row.id ?? ""),
      nome: typeof row.nome === "string" ? row.nome.trim() : "",
      data: row.data,
      horario_inicio: row.horario_inicio,
    } as RowEvt
  })

  const porDataEventos = new Map<string, RowEvt[]>()
  for (const ev of eventosLista) {
    const iso = dataIsoDia(ev.data)
    if (!iso) continue
    if (!porDataEventos.has(iso)) porDataEventos.set(iso, [])
    porDataEventos.get(iso)!.push(ev)
  }
  for (const [iso, arr] of porDataEventos) {
    porDataEventos.set(
      iso,
      [...arr].sort((a, b) => {
        const ta = String(a.horario_inicio ?? "")
        const tb = String(b.horario_inicio ?? "")
        if (ta !== tb) return ta.localeCompare(tb)
        return a.nome.localeCompare(b.nome, "pt")
      }),
    )
  }

  /** Para cada domingo: coluna «culto» + colunas separadas por evento no mesmo dia (se houver). Eventos em dias não-domingo: só colunas de evento. */
  const colunas: ColunaAusencia[] = []
  const eventosJaColuna = new Set<string>()

  for (const iso of domingos) {
    colunas.push({
      key: `${iso}|domingo`,
      iso,
      domingo: true,
      evento: false,
      nomeEvento: null,
    })
    const evs = porDataEventos.get(iso) ?? []
    for (const ev of evs) {
      eventosJaColuna.add(ev.id)
      colunas.push({
        key: `${iso}|evento|${ev.id}`,
        iso,
        domingo: false,
        evento: true,
        nomeEvento: ev.nome || null,
      })
    }
  }

  for (const ev of eventosLista) {
    const iso = dataIsoDia(ev.data)
    if (!iso || eventosJaColuna.has(ev.id)) continue
    colunas.push({
      key: `${iso}|evento|${ev.id}`,
      iso,
      domingo: false,
      evento: true,
      nomeEvento: ev.nome || null,
    })
  }

  colunas.sort((a, b) => {
    if (a.iso !== b.iso) return a.iso.localeCompare(b.iso)
    const ordem = (c: ColunaAusencia) => (c.domingo ? 0 : 1)
    const d = ordem(a) - ordem(b)
    if (d !== 0) return d
    return (a.nomeEvento ?? "").localeCompare(b.nomeEvento ?? "", "pt")
  })

  const idsAtivos = new Set((voluntarios ?? []).map(v => v.id))
  const ausencias = (ausenciasRows ?? []).filter((a: { voluntario_id: string }) => idsAtivos.has(a.voluntario_id))

  return (
    <AusenciasOverviewClient
      mes={mes}
      ministerio={ministerio}
      voluntarios={voluntarios ?? []}
      ausencias={ausencias}
      colunas={colunas}
    />
  )
}
