"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ConfirmDialog"
import { EventoForm } from "@/components/EventoForm"
import { MesPicker } from "@/components/MesPicker"
import { dataIsoParaExibicao, horaBancoParaExibicao, mesAnoRefParaExibicao } from "@/lib/formato-br"

const LABELS_PAPEL: Record<string, string> = {
  audio: "Áudio", projecao: "Projeção", iluminacao: "Iluminação", palco: "Palco", tecnica_bs: "Técnica BS",
}

const actionBase =
  "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gh-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gh-bg"
const actionEditar = `${actionBase} bg-gh-accent/12 text-gh-accent hover:bg-gh-accent/18`
const actionAtivar = `${actionBase} bg-gh-green/12 text-gh-green hover:bg-gh-green/18`
const actionDesativar = `${actionBase} bg-gh-yellow/14 text-gh-yellow hover:bg-gh-yellow/20`
const actionExcluir = `${actionBase} bg-gh-red/12 text-gh-red hover:bg-gh-red/18`

interface Evento {
  id: string
  nome: string
  data: string
  horario_inicio: string
  horario_fim?: string
  ministerios: string[]
  papeis: string[]
  ativo?: boolean | null
  alocacoes_fixas?: Array<{ id: string; papel: string; voluntario_id: string }>
}
interface Voluntario {
  id: string
  nome: string
  ministerio: string
  papeis: string[]
}

export function EventosClient({
  mes,
  eventos,
  voluntarios,
}: {
  mes: string
  eventos: Evento[]
  voluntarios: Voluntario[]
}) {
  const [editando, setEditando] = useState<Evento | null | "novo">(null)
  const [erro, setErro] = useState<string | null>(null)
  const [overrideAtivo, setOverrideAtivo] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { confirm, dialog } = useConfirm()

  const porMes = new Map<string, Evento[]>()
  for (const ev of eventos) {
    const ym = ev.data.slice(0, 7)
    const lista = porMes.get(ym) ?? []
    lista.push(ev)
    porMes.set(ym, lista)
  }

  async function excluir(ev: Evento) {
    setErro(null)
    const ok = await confirm({
      title: "Excluir evento?",
      description: `«${ev.nome}» será removido. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "danger",
    })
    if (!ok) return
    await supabase.from("eventos").delete().eq("id", ev.id)
    router.refresh()
  }

  async function toggleAtivo(ev: Evento) {
    setErro(null)
    const ativoAtual = ev.ativo ?? true
    const ativar = !ativoAtual
    const ok = await confirm({
      title: ativar ? "Ativar evento?" : "Desativar evento?",
      description: ativar
        ? `«${ev.nome}» voltará a aparecer nas escalas e ausências.`
        : `«${ev.nome}» deixará de aparecer nas escalas e ausências.`,
      confirmLabel: ativar ? "Ativar" : "Desativar",
      variant: ativar ? "default" : "danger",
    })
    if (!ok) return
    const { error } = await supabase.from("eventos").update({ ativo: ativar }).eq("id", ev.id)
    if (error) {
      setErro(error.message)
      return
    }
    setOverrideAtivo(prev => ({ ...prev, [ev.id]: ativar }))
    router.refresh()
  }

  if (editando) {
    const isNovo = editando === "novo"
    return (
      <div>
        {dialog}
        <h1 className="text-2xl font-semibold text-gh-text mb-6">{isNovo ? "Novo Evento" : "Editar Evento"}</h1>
        <div className="bg-gh-surface border border-gh-border rounded-xl p-6 max-w-2xl">
          <EventoForm
            key={isNovo ? "novo" : editando.id}
            initial={isNovo ? {} : editando}
            voluntarios={voluntarios}
            onSalvo={() => {
              setEditando(null)
              router.refresh()
            }}
            onCancelar={() => setEditando(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gh-text">Eventos</h1>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <MesPicker
          value={mes}
          onChange={ym => router.push(`/eventos?mes=${ym}`)}
          className="bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent min-w-[14rem]"
          aria-label="Filtrar por mês"
        />
        <button
          type="button"
          onClick={() => setEditando("novo")}
          className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] transition-colors"
        >
          + Adicionar
        </button>
      </div>
      {erro && (
        <div className="mb-4 border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-3 py-2 text-sm text-gh-red">
          {erro}
        </div>
      )}

      {[...porMes.entries()].sort().map(([mesGrupo, evs]) => (
        <div key={mesGrupo} className="mb-6">
          <h2 className="text-xs font-semibold text-gh-muted tracking-wider mb-3">{mesAnoRefParaExibicao(mesGrupo)}</h2>
          <div className="bg-gh-surface border border-gh-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gh-surface-2">
                <tr>
                  {["Nome", "Data", "Horário", "Papéis", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gh-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gh-border">
                {evs.map(ev => {
                  const ativo = overrideAtivo[ev.id] ?? ev.ativo ?? true
                  return (
                  <tr key={ev.id} className="hover:bg-gh-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gh-text">{ev.nome}</td>
                    <td className="px-4 py-3 text-gh-muted">{dataIsoParaExibicao(ev.data)}</td>
                    <td className="px-4 py-3 text-gh-muted">
                      {horaBancoParaExibicao(ev.horario_inicio)}
                      {ev.horario_fim ? ` – ${horaBancoParaExibicao(ev.horario_fim)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gh-muted">
                      {ev.papeis.map(p => LABELS_PAPEL[p] ?? p).join(", ") || <span className="text-gh-muted/50">Todos</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 font-medium ${ativo ? "bg-gh-green/15 text-gh-green" : "bg-gh-yellow/18 text-gh-yellow"}`}>
                        {ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <button type="button" onClick={() => setEditando(ev)} className={actionEditar}>
                          Editar
                        </button>
                        <button type="button" onClick={() => void toggleAtivo(ev)} className={ativo ? actionDesativar : actionAtivar}>
                          {ativo ? "Desativar" : "Ativar"}
                        </button>
                        <button type="button" onClick={() => void excluir(ev)} className={actionExcluir}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!eventos.length && (
        <p className="text-center text-gh-muted text-sm py-12">Nenhum evento neste mês.</p>
      )}
    </div>
  )
}
