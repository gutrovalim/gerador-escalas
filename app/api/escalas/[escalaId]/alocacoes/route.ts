import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ultimoDiaDoMesISO } from "@/lib/mes"
import { voluntarioAusenteNoCulto } from "@/lib/ausencia-alocacao"
import type { Ausencia, TipoCulto } from "@/lib/scheduler/types"

type Alteracao = { id: string; voluntario_id: string | null }
type Nova = {
  data: string
  tipo_culto: TipoCulto
  nome_evento: string | null
  papel: string
  trainee: boolean
  voluntario_id: string
}

function elegivel(
  ministerio: string,
  papel: string,
  trainee: boolean,
  v: {
    ministerio: string
    papeis: string[] | null
    treinamento: string[] | null
    ativo: boolean | null
  },
): boolean {
  if (!v.ativo || v.ministerio !== ministerio) return false
  const papeisV = v.papeis ?? []
  const treino = v.treinamento ?? []
  if (trainee) return treino.includes(papel)
  return papeisV.includes(papel)
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ escalaId: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 })
  }

  const { escalaId } = await context.params
  const body = await req.json().catch(() => null)
  const raw: Alteracao[] = Array.isArray(body?.alteracoes) ? body.alteracoes : []
  const novasRaw: Nova[] = Array.isArray(body?.novas) ? body.novas : []
  const dedup = new Map<string, string | null>()
  for (const a of raw) {
    if (a?.id && ("voluntario_id" in a)) dedup.set(a.id, a.voluntario_id ?? null)
  }
  const alteracoes: Alteracao[] = [...dedup.entries()].map(([id, voluntario_id]) => ({ id, voluntario_id }))
  const novas: Nova[] = novasRaw.filter(
    n =>
      Boolean(n?.data) &&
      (n?.tipo_culto === "dominical_manha" || n?.tipo_culto === "dominical_noite" || n?.tipo_culto === "especial") &&
      Boolean(n?.papel) &&
      Boolean(n?.voluntario_id),
  )
  if (!alteracoes.length && !novas.length) {
    return NextResponse.json({ erro: "Envie «alteracoes» e/ou «novas»." }, { status: 400 })
  }

  const { data: escala, error: errEscala } = await supabase
    .from("escalas")
    .select("id, ministerio, mes")
    .eq("id", escalaId)
    .single()
  if (errEscala || !escala) {
    return NextResponse.json({ erro: "Escala não encontrada." }, { status: 404 })
  }

  const ministerio = escala.ministerio as "tecnica" | "backstage"
  const mesRef = escala.mes as string

  const { data: indRows, error: errInd } = await supabase
    .from("indisponibilidades")
    .select("voluntario_id, data, turnos")
    .gte("data", `${mesRef}-01`)
    .lte("data", ultimoDiaDoMesISO(mesRef))
  if (errInd) {
    return NextResponse.json({ erro: "Erro ao ler ausências: " + errInd.message }, { status: 500 })
  }
  const ausencias: Ausencia[] = (indRows ?? []).map(r => ({
    voluntario_id: r.voluntario_id as string,
    data: r.data as string,
    turnos: (r.turnos as string[]) ?? [],
  }))

  for (const alt of alteracoes) {
    if (!alt.id) {
      return NextResponse.json({ erro: "Cada alteração precisa de id." }, { status: 400 })
    }
  }

  const ids = [...new Set(alteracoes.map(a => a.id))]
  const { data: linhas, error: errLinhas } = await supabase
    .from("alocacoes")
    .select("id, escala_id, papel, trainee, data, tipo_culto")
    .eq("escala_id", escalaId)
    .in("id", ids)
  if (errLinhas) {
    return NextResponse.json({ erro: "Erro ao ler alocações: " + errLinhas.message }, { status: 500 })
  }
  if (!linhas || linhas.length !== ids.length) {
    return NextResponse.json({ erro: "Uma ou mais alocações não pertencem a esta escala." }, { status: 400 })
  }

  const porId = new Map(linhas.map(l => [l.id, l]))

  const volIds = [
    ...new Set([
      ...alteracoes.map(a => a.voluntario_id).filter((id): id is string => Boolean(id)),
      ...novas.map(n => n.voluntario_id),
    ]),
  ]
  let volPorId = new Map<string, { id: string; ministerio: string; papeis: string[] | null; treinamento: string[] | null; ativo: boolean | null }>()
  if (volIds.length > 0) {
    const { data: vols, error: errVols } = await supabase
      .from("voluntarios")
      .select("id, ministerio, papeis, treinamento, ativo")
      .in("id", volIds)
    if (errVols) {
      return NextResponse.json({ erro: "Erro ao ler voluntários: " + errVols.message }, { status: 500 })
    }
    volPorId = new Map((vols ?? []).map(v => [v.id, v]))
  }

  for (const alt of alteracoes) {
    const linha = porId.get(alt.id)
    if (!linha) {
      return NextResponse.json({ erro: "Dados inconsistentes na alteração." }, { status: 400 })
    }
    if (!alt.voluntario_id) continue
    const vol = volPorId.get(alt.voluntario_id)
    if (!vol) {
      return NextResponse.json({ erro: "Voluntário não encontrado para a alteração." }, { status: 400 })
    }
    if (!elegivel(ministerio, linha.papel as string, linha.trainee as boolean, vol)) {
      return NextResponse.json(
        {
          erro: `Voluntário inválido para o papel «${linha.papel}»${linha.trainee ? " (trainee)" : ""}: ${vol.id}.`,
        },
        { status: 400 },
      )
    }
    const tipo = linha.tipo_culto as TipoCulto
    const dataCulto = String(linha.data)
    if (voluntarioAusenteNoCulto(ausencias, alt.voluntario_id, dataCulto, tipo)) {
      return NextResponse.json(
        {
          erro:
            "Não é possível alocar este voluntário: há ausência cadastrada para este dia (e turno, quando aplicável).",
        },
        { status: 400 },
      )
    }
  }

  for (const n of novas) {
    const vol = volPorId.get(n.voluntario_id)
    if (!vol) {
      return NextResponse.json({ erro: "Voluntário não encontrado para nova alocação." }, { status: 400 })
    }
    if (!elegivel(ministerio, n.papel, n.trainee, vol)) {
      return NextResponse.json(
        {
          erro: `Voluntário inválido para o papel «${n.papel}»${n.trainee ? " (trainee)" : ""}: ${vol.id}.`,
        },
        { status: 400 },
      )
    }
    if (voluntarioAusenteNoCulto(ausencias, n.voluntario_id, n.data, n.tipo_culto)) {
      return NextResponse.json(
        {
          erro:
            "Não é possível alocar este voluntário: há ausência cadastrada para este dia (e turno, quando aplicável).",
        },
        { status: 400 },
      )
    }
  }

  for (const alt of alteracoes) {
    const { error: errUp } = await supabase
      .from("alocacoes")
      .update({ voluntario_id: alt.voluntario_id })
      .eq("id", alt.id)
      .eq("escala_id", escalaId)
    if (errUp) {
      return NextResponse.json({ erro: errUp.message }, { status: 500 })
    }
  }

  if (novas.length > 0) {
    const linhas = novas.map(n => ({
      escala_id: escalaId,
      data: n.data,
      tipo_culto: n.tipo_culto,
      nome_evento: n.tipo_culto === "especial" ? n.nome_evento : null,
      papel: n.papel,
      voluntario_id: n.voluntario_id,
      trainee: n.trainee,
      fixada: false,
    }))
    const { error: errIns } = await supabase.from("alocacoes").insert(linhas)
    if (errIns) {
      return NextResponse.json({ erro: errIns.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, atualizadas: alteracoes.length, novas: novas.length })
}
