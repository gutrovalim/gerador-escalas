"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { EscalaTable } from "@/components/EscalaTable"
import { gerarCsv } from "@/lib/export/formatter"
import { MesPicker } from "@/components/MesPicker"
import { dataHoraIsoParaExibicao, refAnoMesParaExibicao } from "@/lib/formato-br"
import { mesReferenciaTituloPt } from "@/lib/mes"
import { cultosDoMesComAlocacoes } from "@/lib/escala-cultos-ui"
import type { Ausencia, Evento, MinisterioSlug } from "@/lib/scheduler/types"
import { useConfirm } from "@/components/ConfirmDialog"

interface Alocacao {
  id: string
  voluntario_id: string | null
  papel: string
  trainee: boolean
  fixada: boolean
}
interface CultoGerado {
  data: string
  tipo: string
  nome?: string
  ministerio: string
  horario_inicio?: string
  horario_fim?: string
  alocacoes: Alocacao[]
}

function enriquecerCultosComHorariosEventos(
  lista: CultoGerado[],
  eventosPorDataNome: Record<string, { horario_inicio: string; horario_fim: string | null }>,
): CultoGerado[] {
  return lista.map(c => {
    if (c.tipo !== "especial" || !c.nome) return c
    const meta = eventosPorDataNome[`${c.data}|${c.nome}`]
    if (!meta) return c
    return {
      ...c,
      horario_inicio: meta.horario_inicio,
      horario_fim: meta.horario_fim ?? undefined,
    }
  })
}

const selectCls = "bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent"

const LABEL_MIN: Record<string, string> = { tecnica: "Técnica", backstage: "Backstage" }

export function EscalasClient({
  mes,
  ministerio,
  ministeriosComEscalaNoMes,
  escala,
  alocacoesRaw,
  eventosCalendario,
  voluntarios,
  historico,
  eventosPorDataNome,
  ausencias,
}: {
  mes: string
  ministerio: string
  /** Ministérios que já têm registo de escala neste mês (para confirmar sobrescrita). */
  ministeriosComEscalaNoMes: string[]
  escala: { id: string; gerada_em: string; alertas: string[] } | null
  alocacoesRaw: Record<string, unknown>[]
  eventosCalendario: Evento[]
  voluntarios: {
    id: string
    nome: string
    ministerio: string
    papeis: string[] | null
    treinamento: string[] | null
    ativo: boolean | null
  }[]
  historico: { id: string; mes: string; ministerio: string; gerada_em: string }[]
  eventosPorDataNome: Record<string, { horario_inicio: string; horario_fim: string | null }>
  ausencias: Ausencia[]
}) {
  /** Estado local evita POST com ministério/mês antigos antes do `router.push` concluir. */
  const [mesSel, setMesSel] = useState(mes)
  const [minSel, setMinSel] = useState(ministerio)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [draftVoluntarios, setDraftVoluntarios] = useState<Record<string, string>>({})
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const router = useRouter()
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    setMesSel(mes)
    setMinSel(ministerio)
  }, [mes, ministerio])

  useEffect(() => {
    setEditando(false)
    setDraftVoluntarios({})
  }, [mes, ministerio, escala?.id])

  /** Enquanto o `router.push` não atualiza a página, props ainda refletem mês/ministério antigos. */
  const synced = mes === mesSel && ministerio === minSel

  const nomesPorId: Record<string, string> = {}
  for (const v of voluntarios) nomesPorId[v.id] = v.nome

  const alocacoesRawComDraft = editando
    ? alocacoesRaw.map(r => {
        const id = r.id as string
        const v = draftVoluntarios[id]
        return v !== undefined ? { ...r, voluntario_id: v } : r
      })
    : alocacoesRaw

  const cultos = synced
    ? enriquecerCultosComHorariosEventos(
        cultosDoMesComAlocacoes(
          mes,
          ministerio as MinisterioSlug,
          eventosCalendario,
          alocacoesRawComDraft,
        ) as CultoGerado[],
        eventosPorDataNome,
      )
    : []

  function iniciarEdicao() {
    const d: Record<string, string> = {}
    for (const r of alocacoesRaw) {
      if (r.id) d[r.id as string] = (r.voluntario_id as string | null) ?? ""
    }
    setDraftVoluntarios(d)
    setEditando(true)
    setErro(null)
  }

  function temAlteracoesNaoGuardadas(): boolean {
    for (const r of alocacoesRaw) {
      const id = r.id as string
      const orig = (r.voluntario_id as string | null) ?? ""
      const novo = draftVoluntarios[id] ?? orig
      if (novo !== orig) return true
    }
    for (const [id, volId] of Object.entries(draftVoluntarios)) {
      if (id.startsWith("novo|") && volId) return true
    }
    return false
  }

  async function cancelarEdicao() {
    if (temAlteracoesNaoGuardadas()) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "As alterações à escala não serão guardadas.",
        confirmLabel: "Descartar",
        variant: "danger",
      })
      if (!ok) return
    }
    setEditando(false)
    setDraftVoluntarios({})
    setErro(null)
  }

  async function salvarEdicao() {
    if (!escala) return
    const alteracoes: { id: string; voluntario_id: string | null }[] = []
    const novas: Array<{
      data: string
      tipo_culto: "dominical_manha" | "dominical_noite" | "especial"
      nome_evento: string | null
      papel: string
      trainee: boolean
      voluntario_id: string
    }> = []
    for (const r of alocacoesRaw) {
      const id = r.id as string
      const orig = (r.voluntario_id as string | null) ?? ""
      const novo = draftVoluntarios[id] ?? orig
      if (novo === orig) continue
      alteracoes.push({ id, voluntario_id: novo || null })
    }
    for (const c of cultos) {
      for (const a of c.alocacoes) {
        if (!a.id.startsWith("novo|")) continue
        const novo = draftVoluntarios[a.id] ?? (a.voluntario_id ?? "")
        if (!novo) continue
        novas.push({
          data: c.data,
          tipo_culto: c.tipo as "dominical_manha" | "dominical_noite" | "especial",
          nome_evento: c.tipo === "especial" ? (c.nome ?? null) : null,
          papel: a.papel,
          trainee: Boolean(a.trainee),
          voluntario_id: novo,
        })
      }
    }
    if (!alteracoes.length && !novas.length) {
      setEditando(false)
      return
    }
    const ok = await confirm({
      title: "Guardar alterações à escala?",
      description: "As alocações editadas serão enviadas ao servidor.",
      confirmLabel: "Guardar",
    })
    if (!ok) return
    setSalvandoEdicao(true)
    setErro(null)
    try {
      const res = await fetch(`/api/escalas/${escala.id}/alocacoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ alteracoes, novas }),
      })
      let data: { erro?: string } = {}
      try {
        const text = await res.text()
        data = text ? (JSON.parse(text) as { erro?: string }) : {}
      } catch {
        setErro(`Resposta inválida do servidor (${res.status}).`)
        return
      }
      if (!res.ok) {
        setErro(data.erro ?? "Erro ao salvar alterações.")
        return
      }
      setEditando(false)
      setDraftVoluntarios({})
      router.refresh()
    } catch {
      setErro("Erro de rede ao salvar.")
    } finally {
      setSalvandoEdicao(false)
    }
  }

  function aoMudarVoluntario(alocacaoId: string, voluntarioId: string) {
    setDraftVoluntarios(prev => ({ ...prev, [alocacaoId]: voluntarioId }))
  }

  async function gerarEscala() {
    if (!synced) return
    if (ministeriosComEscalaNoMes.length > 0) {
      const quais = ministeriosComEscalaNoMes
        .map(m => LABEL_MIN[m] ?? m)
        .join(" e ")
      const ok = await confirm({
        title: "Sobrescrever escalas?",
        description: `Já existem escalas para ${mesReferenciaTituloPt(mes)} (${quais}). Técnica e Backstage são geradas juntas; as duas escalas deste mês serão substituídas.`,
        confirmLabel: "Sim, sobrescrever",
        variant: "danger",
      })
      if (!ok) return
    }
    setErro(null)
    setGerando(true)
    try {
      const res = await fetch("/api/escalas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mes: mesSel, ministerio: minSel }),
      })
      let data: { erro?: string } = {}
      try {
        const text = await res.text()
        data = text ? (JSON.parse(text) as { erro?: string }) : {}
      } catch {
        setErro(`Resposta inválida do servidor (${res.status}).`)
        return
      }
      if (!res.ok) {
        setErro(data.erro ?? "Erro ao gerar escala.")
        return
      }
      router.refresh()
    } catch {
      setErro("Erro de rede ao gerar escala.")
    } finally {
      setGerando(false)
    }
  }

  function exportarCsv() {
    const nomesMapa = new Map(Object.entries(nomesPorId))
    const modo = ministerio === "tecnica" ? "equipe_unica" : "independente"
    const csv = gerarCsv(
      cultos as Parameters<typeof gerarCsv>[0],
      ministerio as "tecnica" | "backstage",
      modo,
      nomesMapa,
    )
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `escala_${mes}_${ministerio}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gh-text">Escalas</h1>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <MesPicker
          value={mesSel}
          onChange={ym => {
            setMesSel(ym)
            router.push(`/escalas?mes=${ym}&ministerio=${minSel}`)
          }}
          className={selectCls}
          aria-label="Mês de referência"
          disabled={editando}
        />
        <select
          value={minSel}
          onChange={e => {
            const v = e.target.value
            setMinSel(v)
            router.push(`/escalas?mes=${mesSel}&ministerio=${v}`)
          }}
          className={selectCls}
          aria-label="Ministério"
          disabled={editando}
        >
          <option value="backstage">Backstage</option>
          <option value="tecnica">Técnica</option>
        </select>
        <Link
          href={`/escalas/alocacoes-fixas-cultos?mes=${encodeURIComponent(mesSel)}&ministerio=${encodeURIComponent(minSel)}`}
          className={`inline-flex items-center border border-gh-border rounded-lg px-4 py-2 text-sm text-gh-text hover:bg-gh-surface-2 transition-colors ${editando ? "pointer-events-none opacity-50" : ""}`}
          aria-disabled={editando}
        >
          Alocações fixas (cultos)
        </Link>
        <button
          type="button"
          onClick={() => void gerarEscala()}
          disabled={gerando || editando || !synced}
          className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] disabled:opacity-50 transition-colors"
        >
          {gerando ? "Gerando…" : "Gerar escalas (Técnica + Backstage)"}
        </button>
      </div>

      {erro && (
        <div className="border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-4 py-3 mb-5 text-sm text-gh-red">
          {erro}
        </div>
      )}

      {!synced && (
        <p className="text-sm text-gh-muted mb-4">Atualizando escala…</p>
      )}

      {synced && escala && (
        <>
          <p className="text-xs text-gh-muted mb-3">
            Gerada em {dataHoraIsoParaExibicao(escala.gerada_em)}
          </p>
          {escala.alertas?.length > 0 && (
            <div className="border-l-2 border-gh-yellow bg-gh-yellow/10 rounded-r-lg px-4 py-3 mb-6">
              <p className="text-sm font-medium text-gh-yellow mb-2">Alertas:</p>
              <ul className="text-sm text-gh-yellow/80 space-y-1">
                {escala.alertas.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 mb-4">
            {!editando ? (
              <button
                type="button"
                onClick={iniciarEdicao}
                className="border border-gh-border rounded-lg px-4 py-2 text-sm text-gh-text hover:bg-gh-surface-2 transition-colors"
              >
                Editar escala
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void cancelarEdicao()}
                  disabled={salvandoEdicao}
                  className="border border-gh-border rounded-lg px-4 py-2 text-sm text-gh-muted hover:text-gh-text hover:bg-gh-surface-2 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void salvarEdicao()}
                  disabled={salvandoEdicao}
                  className="bg-gh-green text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {salvandoEdicao ? "Salvando…" : "Salvar alterações"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={exportarCsv}
              className="border border-gh-border rounded-lg px-4 py-2 text-sm text-gh-muted hover:text-gh-text hover:bg-gh-surface-2 transition-colors"
            >
              ↓ Exportar CSV
            </button>
          </div>
          <EscalaTable
            cultos={cultos}
            ministerio={ministerio}
            nomesPorId={nomesPorId}
            editando={editando}
            voluntarios={voluntarios}
            draftVoluntarios={draftVoluntarios}
            onMudarVoluntario={aoMudarVoluntario}
            ausencias={ausencias}
          />
        </>
      )}

      {synced && !escala && !gerando && (
        <div className="text-center py-16">
          <p className="text-gh-muted text-sm">
            Nenhuma escala gerada para {refAnoMesParaExibicao(mes)} ({LABEL_MIN[ministerio] ?? ministerio}).
          </p>
          <p className="text-gh-muted/60 text-xs mt-1">Clique em "Gerar Escala" para começar.</p>
        </div>
      )}

      {historico.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xs font-semibold text-gh-muted uppercase tracking-wider mb-3">Histórico</h2>
          <div className="bg-gh-surface border border-gh-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gh-surface-2">
                <tr>
                  {["Mês", "Ministério", "Gerada em", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gh-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gh-border">
                {historico.map(h => (
                  <tr key={h.id} className="hover:bg-gh-surface-2/50 transition-colors">
                    <td className="px-4 py-3 text-gh-text">{refAnoMesParaExibicao(h.mes)}</td>
                    <td className="px-4 py-3 text-gh-muted capitalize">{h.ministerio}</td>
                    <td className="px-4 py-3 text-gh-muted">{dataHoraIsoParaExibicao(h.gerada_em)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/escalas?mes=${h.mes}&ministerio=${h.ministerio}`)}
                        className="text-xs text-gh-accent hover:underline"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
