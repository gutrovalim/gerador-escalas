import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { mapaFixasCultoDesdeLinhas } from "@/lib/fixas-culto-mapa"
import { ultimoDiaDoMesISO } from "@/lib/mes"
import { gerarCultosDoMes } from "@/lib/scheduler/calendar"
import { alocarEscala, resolverModosMinisterio } from "@/lib/scheduler/algorithm"
import {
  MINISTERIOS_ORDEM_ALOCACAO,
  type ConfigMinisterio,
  type CultoGerado,
  type Evento,
  type Ausencia,
  type MinisterioSlug,
  type PapelSlug,
  type Par,
  type RestricaoTipo,
  type Voluntario,
} from "@/lib/scheduler/types"

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.mes || !/^\d{4}-\d{2}$/.test(body.mes)) {
    return NextResponse.json({ erro: "Campo «mes» obrigatório no formato YYYY-MM." }, { status: 400 })
  }
  const mes: string = body.mes
  const mRaw = body.ministerio
  if (mRaw !== "tecnica" && mRaw !== "backstage") {
    return NextResponse.json(
      { erro: "Campo «ministerio» obrigatório: «tecnica» ou «backstage»." },
      { status: 400 },
    )
  }
  const ministerioFiltro: MinisterioSlug = mRaw

  // ── Leitura do banco ──────────────────────────────────────────────────────

  const [resVols, resPares, resConf, resIndisp, resEventos, resFixasCulto] = await Promise.all([
    supabase.from("voluntarios").select("*").eq("ativo", true),
    supabase.from("pares").select("*"),
    supabase.from("config_ministerios").select("*"),
    supabase.from("indisponibilidades").select("*").gte("data", `${mes}-01`).lte("data", ultimoDiaDoMesISO(mes)),
    supabase.from("eventos").select("*, alocacoes_fixas(*)").eq("ativo", true).gte("data", `${mes}-01`).lte("data", ultimoDiaDoMesISO(mes)),
    supabase.from("alocacoes_fixas_culto").select("*").eq("mes", mes),
  ])

  for (const res of [resVols, resPares, resConf, resIndisp, resEventos, resFixasCulto]) {
    if (res.error) {
      return NextResponse.json({ erro: "Erro ao ler dados: " + res.error.message }, { status: 500 })
    }
  }

  // ── Conversão de tipos ────────────────────────────────────────────────────

  const voluntarios: Voluntario[] = (resVols.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    nome: r.nome as string,
    ministerio: r.ministerio as MinisterioSlug,
    papeis: ((r.papeis as string[]) ?? []) as PapelSlug[],
    treinamento: ((r.treinamento as string[]) ?? []) as PapelSlug[],
    restricoes: ((r.restricoes as string[]) ?? []) as RestricaoTipo[],
    ativo: r.ativo as boolean,
  }))

  const ausencias: Ausencia[] = (resIndisp.data ?? []).map((r: Record<string, unknown>) => ({
    voluntario_id: r.voluntario_id as string,
    data: r.data as string,
    turnos: (r.turnos as string[]) ?? [],
  }))

  const pares: Par[] = (resPares.data ?? [])
    .map((r: Record<string, unknown>) => ({
      ativo: (r.ativo as boolean) ?? true,
      membro_1: r.membro_1 as string,
      membro_2: r.membro_2 as string,
      ministerio: (r.ministerio as MinisterioSlug) ?? null,
      tipo: r.tipo as "par" | "par_cross",
    }))
    .filter(p => p.ativo)

  const paresCross: [string, string][] = pares
    .filter(p => p.tipo === "par_cross")
    .map(p => [p.membro_1, p.membro_2])

  const configs: ConfigMinisterio[] = (resConf.data ?? []).map((r: Record<string, unknown>) => ({
    slug: r.slug as MinisterioSlug,
    modo: r.modo as "equipe_unica" | "independente",
  }))

  const eventos: Evento[] = (resEventos.data ?? []).map((r: Record<string, unknown>) => {
    const fixas = Array.isArray(r.alocacoes_fixas) ? r.alocacoes_fixas : []
    return {
      id: r.id as string,
      nome: r.nome as string,
      data: r.data as string,
      horario_inicio: r.horario_inicio as string,
      horario_fim: r.horario_fim as string | undefined,
      ministerios: (r.ministerios as MinisterioSlug[]) ?? [],
      papeis: ((r.papeis as string[]) ?? []) as import("@/lib/scheduler/types").PapelSlug[],
      alocacoes_fixas: fixas.map((f: Record<string, unknown>) => ({
        papel: f.papel as import("@/lib/scheduler/types").PapelSlug,
        voluntario_id: f.voluntario_id as string,
      })),
    }
  })

  const modos = resolverModosMinisterio(configs)

  const fixasCultoPorSlot = mapaFixasCultoDesdeLinhas(
    (resFixasCulto.data ?? []) as Record<string, unknown>[],
  )

  // ── Geração ───────────────────────────────────────────────────────────────

  const cultos = gerarCultosDoMes(mes, eventos)
  const [cultosAlocados, alertas, naoAlocados] = alocarEscala(
    mes,
    voluntarios,
    ausencias,
    eventos,
    cultos,
    pares,
    modos,
    paresCross,
    fixasCultoPorSlot.size > 0 ? fixasCultoPorSlot : undefined,
  )

  const alertasFinal = [
    ...alertas,
    ...naoAlocados.map(([nome, motivo]) => `${nome}: ${motivo}`),
  ]

  // ── Persiste no banco (sempre os dois ministérios na mesma execução de algoritmo) ──
  // Pares cross-ministério (ex.: Técnica + Backstage) só permanecem coerentes se ambas
  // as escalas forem gravadas a partir do mesmo resultado de `alocarEscala`.

  const resultados: Record<string, string> = {}

  for (const ministerio of MINISTERIOS_ORDEM_ALOCACAO) {
    const { data: escalaExistente } = await supabase
      .from("escalas")
      .select("id")
      .eq("mes", mes)
      .eq("ministerio", ministerio)
      .maybeSingle()

    let escalaId: string

    if (escalaExistente) {
      await supabase.from("alocacoes").delete().eq("escala_id", escalaExistente.id)
      const { data: escUpd, error: errUpd } = await supabase
        .from("escalas")
        .update({ gerada_em: new Date().toISOString(), alertas: alertasFinal })
        .eq("id", escalaExistente.id)
        .select("id")
        .single()
      if (errUpd) return NextResponse.json({ erro: errUpd.message }, { status: 500 })
      escalaId = escUpd.id
    } else {
      const { data: escNova, error: errNova } = await supabase
        .from("escalas")
        .insert({ mes, ministerio, alertas: alertasFinal })
        .select("id")
        .single()
      if (errNova) return NextResponse.json({ erro: errNova.message }, { status: 500 })
      escalaId = escNova.id
    }

    resultados[ministerio] = escalaId

    const cultosMinis = cultosAlocados.filter(c => c.ministerio === ministerio)
    const linhasAlocacao: Record<string, unknown>[] = []

    for (const culto of cultosMinis) {
      for (const al of culto.alocacoes) {
        linhasAlocacao.push({
          escala_id: escalaId,
          data: culto.data,
          tipo_culto: culto.tipo,
          nome_evento: culto.tipo === "especial" ? culto.nome : null,
          papel: al.papel,
          voluntario_id: al.voluntario_id,
          trainee: al.trainee,
          fixada: al.fixada,
        })
      }
    }

    if (linhasAlocacao.length) {
      const { error: errAl } = await supabase.from("alocacoes").insert(linhasAlocacao)
      if (errAl) return NextResponse.json({ erro: errAl.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    mes,
    escalas: resultados,
    alertas: alertasFinal,
    cultos: cultosAlocados.filter(c => c.ministerio === ministerioFiltro),
  })
}
