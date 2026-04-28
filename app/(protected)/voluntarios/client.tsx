"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ConfirmDialog"
import { VoluntarioForm } from "@/components/VoluntarioForm"

const LABELS_MIN: Record<string, string> = { tecnica: "Técnica", backstage: "Backstage" }
const LABELS_PAPEL: Record<string, string> = {
  audio: "Áudio", projecao: "Projeção", iluminacao: "Iluminação", palco: "Palco", tecnica_bs: "Técnica BS",
}

interface Voluntario {
  id: string; nome: string; ministerio: string; papeis: string[]
  treinamento: string[]; restricoes: string[]; ativo: boolean
}
interface Par {
  id: string; membro_1: string; membro_2: string; tipo: string; ministerio: string | null; ativo?: boolean
  m1?: { nome: string }; m2?: { nome: string }
}

const selectCls = "bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent"
const actionBase =
  "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gh-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gh-bg"
const actionAusencias =
  `${actionBase} bg-[#db61a2]/12 text-[#db61a2] hover:bg-[#db61a2]/18`
const actionEditar =
  `${actionBase} bg-gh-accent/12 text-gh-accent hover:bg-gh-accent/18`
const actionAtivar =
  `${actionBase} bg-gh-green/12 text-gh-green hover:bg-gh-green/18`
const actionDesativar =
  `${actionBase} bg-gh-red/12 text-gh-red hover:bg-gh-red/18`
const actionExcluir =
  `${actionBase} bg-gh-red/20 text-gh-red hover:bg-gh-red/28`

export function VoluntariosClient({ voluntarios, pares }: { voluntarios: Voluntario[]; pares: Par[] }) {
  const [filtroMin, setFiltroMin] = useState("todos")
  const [filtroStatus, setFiltroStatus] = useState("ativos")
  const [editando, setEditando] = useState<Voluntario | null | "novo">(null)
  const [editandoPar, setEditandoPar] = useState<
    | { id?: string; membro_1: string; membro_2: string; tipo: "par" | "par_cross"; ministerio: string | null; ativo?: boolean }
    | null
  >(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { confirm, dialog } = useConfirm()

  const filtrados = voluntarios.filter(v => {
    if (filtroMin !== "todos" && v.ministerio !== filtroMin) return false
    if (filtroStatus === "ativos" && !v.ativo) return false
    if (filtroStatus === "inativos" && v.ativo) return false
    return true
  })

  const filtradosSet = useMemo(() => new Set(filtrados.map(v => v.id)), [filtrados])

  /** Mesmos filtros de ministério/estado dos voluntários; par cross exibido pelo membro do ministério selecionado. */
  const paresFiltrados = useMemo(() => {
    return pares.filter(p => {
      const v1 = voluntarios.find(x => x.id === p.membro_1)
      const v2 = voluntarios.find(x => x.id === p.membro_2)
      if (!v1 || !v2) return false
      if (p.tipo === "par_cross" && filtroMin !== "todos") {
        const noMin = v1.ministerio === filtroMin ? v1 : v2.ministerio === filtroMin ? v2 : null
        if (!noMin) return false
        return filtradosSet.has(noMin.id)
      }
      return filtradosSet.has(v1.id) && filtradosSet.has(v2.id)
    })
  }, [pares, voluntarios, filtroMin, filtradosSet])

  async function toggleAtivo(v: Voluntario) {
    const ok = await confirm({
      title: v.ativo ? "Desativar voluntário?" : "Ativar voluntário?",
      description: v.ativo
        ? `${v.nome} deixará de ser considerado nas escalas automáticas.`
        : `${v.nome} voltará a poder ser alocado.`,
      confirmLabel: v.ativo ? "Desativar" : "Ativar",
      variant: v.ativo ? "danger" : "default",
    })
    if (!ok) return
    await supabase.from("voluntarios").update({ ativo: !v.ativo }).eq("id", v.id)
    router.refresh()
  }

  async function excluirVoluntario(v: Voluntario) {
    const ok = await confirm({
      title: "Excluir voluntário?",
      description: `«${v.nome}» será removido permanentemente, incluindo vínculos relacionados.`,
      confirmLabel: "Excluir",
      variant: "danger",
    })
    if (!ok) return
    await supabase.from("voluntarios").delete().eq("id", v.id)
    router.refresh()
  }

  async function salvarPar(payload: { id?: string; membro_1: string; membro_2: string; tipo: "par" | "par_cross"; ministerio: string | null }) {
    const ok = await confirm({
      title: payload.id ? "Guardar dupla?" : "Criar dupla obrigatória?",
      description: payload.id
        ? "As alterações a esta dupla serão gravadas."
        : "A nova dupla será registada e aplicada na geração de escalas.",
      confirmLabel: "Guardar",
    })
    if (!ok) return
    const [a, b] = [payload.membro_1, payload.membro_2].sort()
    const row = {
      membro_1: a,
      membro_2: b,
      tipo: payload.tipo,
      ministerio: payload.tipo === "par_cross" ? null : payload.ministerio,
      ativo: true,
    }

    if (payload.id) {
      await supabase.from("pares").update(row).eq("id", payload.id)
    } else {
      await supabase.from("pares").insert(row)
    }
    setEditandoPar(null)
    router.refresh()
  }

  async function toggleParAtivo(p: Par) {
    const ativo = (p.ativo ?? true)
    const ok = await confirm({
      title: ativo ? "Desativar dupla?" : "Ativar dupla?",
      description: ativo
        ? "Esta dupla deixará de ser considerada na geração."
        : "Esta dupla voltará a ser considerada na geração.",
      confirmLabel: ativo ? "Desativar" : "Ativar",
      variant: ativo ? "danger" : "default",
    })
    if (!ok) return
    await supabase.from("pares").update({ ativo: !ativo }).eq("id", p.id)
    router.refresh()
  }

  async function fecharEdicaoPar() {
    if (editandoPar && (editandoPar.membro_1 || editandoPar.membro_2)) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Os dados não guardados desta dupla serão perdidos.",
        confirmLabel: "Descartar",
        variant: "danger",
      })
      if (!ok) return
    }
    setEditandoPar(null)
  }

  if (editando) {
    const isNovo = editando === "novo"
    return (
      <div>
        {dialog}
        <h1 className="text-2xl font-semibold text-gh-text mb-6">
          {isNovo ? "Adicionar Voluntário" : "Editar Voluntário"}
        </h1>
        <div className="bg-gh-surface border border-gh-border rounded-xl p-6 max-w-lg">
          <VoluntarioForm
            initial={isNovo ? {} : (editando as Voluntario)}
            onSalvo={() => { setEditando(null); router.refresh() }}
            onCancelar={() => setEditando(null)}
          />
        </div>
      </div>
    )
  }

  if (editandoPar) {
    const isNovo = !editandoPar.id
    const membrosAtivos = voluntarios.filter(v => v.ativo)
    return (
      <div>
        {dialog}
        <h1 className="text-2xl font-semibold text-gh-text mb-6">
          {isNovo ? "Adicionar Dupla Obrigatória" : "Editar Dupla Obrigatória"}
        </h1>

        <div className="bg-gh-surface border border-gh-border rounded-xl p-6 max-w-lg space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-medium text-gh-muted">Tipo</label>
            <select
              value={editandoPar.tipo}
              onChange={e => setEditandoPar(p => (p ? { ...p, tipo: e.target.value as "par" | "par_cross", ministerio: e.target.value === "par_cross" ? null : (p.ministerio ?? "tecnica") } : p))}
              className={selectCls}
            >
              <option value="par">Par (mesmo ministério)</option>
              <option value="par_cross">Cross-ministério</option>
            </select>
          </div>

          {editandoPar.tipo !== "par_cross" && (
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs font-medium text-gh-muted">Ministério</label>
              <select
                value={editandoPar.ministerio ?? "tecnica"}
                onChange={e => setEditandoPar(p => (p ? { ...p, ministerio: e.target.value } : p))}
                className={selectCls}
              >
                <option value="tecnica">Técnica</option>
                <option value="backstage">Backstage</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-medium text-gh-muted">Membro 1</label>
            <select
              value={editandoPar.membro_1}
              onChange={e => setEditandoPar(p => (p ? { ...p, membro_1: e.target.value } : p))}
              className={selectCls}
            >
              <option value="" disabled>Selecione…</option>
              {membrosAtivos.map(v => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-medium text-gh-muted">Membro 2</label>
            <select
              value={editandoPar.membro_2}
              onChange={e => setEditandoPar(p => (p ? { ...p, membro_2: e.target.value } : p))}
              className={selectCls}
            >
              <option value="" disabled>Selecione…</option>
              {membrosAtivos
                .filter(v => v.id !== editandoPar.membro_1)
                .map(v => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] transition-colors disabled:opacity-50"
              disabled={!editandoPar.membro_1 || !editandoPar.membro_2 || editandoPar.membro_1 === editandoPar.membro_2}
              onClick={() => void salvarPar(editandoPar)}
            >
              Salvar
            </button>
            <button
              type="button"
              className="bg-gh-surface-2 border border-gh-border rounded-lg px-4 py-2 text-sm text-gh-text hover:bg-gh-surface-2/70 transition-colors"
              onClick={() => void fecharEdicaoPar()}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gh-text">Voluntários</h1>
        <button
          onClick={() => setEditando("novo")}
          className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] transition-colors"
        >
          + Adicionar
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filtroMin} onChange={e => setFiltroMin(e.target.value)} className={selectCls}>
          <option value="todos">Todos os ministérios</option>
          <option value="tecnica">Técnica</option>
          <option value="backstage">Backstage</option>
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className={selectCls}>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="bg-gh-surface border border-gh-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gh-surface-2">
            <tr>
              {["Nome", "Ministério", "Papéis", "Status", ""].map(h => (
                <th key={h} className={`px-4 py-3 text-left text-xs font-medium text-gh-muted uppercase tracking-wide ${!h ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gh-border">
            {filtrados.map(v => (
              <tr key={v.id} className="hover:bg-gh-surface-2/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gh-text">{v.nome}</td>
                <td className="px-4 py-3 text-gh-muted">{LABELS_MIN[v.ministerio] ?? v.ministerio}</td>
                <td className="px-4 py-3 text-gh-muted align-top">
                  <div className="flex flex-col gap-2 min-w-[10rem]">
                    {(v.papeis.length > 0 || v.treinamento.length === 0) && (
                      <span>
                        {v.papeis.length > 0 ? v.papeis.map(p => LABELS_PAPEL[p] ?? p).join(", ") : "—"}
                      </span>
                    )}
                    {v.treinamento.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gh-yellow shrink-0">
                          Treinando
                        </span>
                        {v.treinamento.map(p => (
                          <span
                            key={p}
                            className="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold bg-gh-yellow/15 text-gh-yellow border border-gh-yellow/35"
                          >
                            {LABELS_PAPEL[p] ?? p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 font-medium ${
                    v.ativo
                      ? "bg-gh-green/15 text-gh-green"
                      : "bg-gh-red/15 text-gh-red"
                  }`}>
                    {v.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3 justify-end">
                    {v.ativo ? (
                      <Link href={`/voluntarios/${v.id}/indisponibilidades`} className={actionAusencias}>
                        Ausências
                      </Link>
                    ) : null}
                    <button onClick={() => setEditando(v)} className={actionEditar}>
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleAtivo(v)}
                      className={v.ativo ? actionDesativar : actionAtivar}
                    >
                      {v.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluirVoluntario(v)}
                      className={actionExcluir}
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtrados.length && (
          <p className="px-4 py-10 text-center text-gh-muted text-sm">Nenhum voluntário encontrado.</p>
        )}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-semibold text-gh-text">Duplas obrigatórias</h2>
          <button
            onClick={() => setEditandoPar({ membro_1: "", membro_2: "", tipo: "par", ministerio: "tecnica" })}
            className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] transition-colors"
          >
            + Adicionar
          </button>
        </div>
          <div className="bg-gh-surface border border-gh-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gh-surface-2">
                <tr>
                  {["Membro 1", "Membro 2", "Tipo", "Ministério", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gh-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gh-border">
                {paresFiltrados.map(p => (
                  <tr key={p.id} className="hover:bg-gh-surface-2/50">
                    <td className="px-4 py-3 text-gh-text">{(p.m1 as { nome: string } | undefined)?.nome ?? p.membro_1}</td>
                    <td className="px-4 py-3 text-gh-text">{(p.m2 as { nome: string } | undefined)?.nome ?? p.membro_2}</td>
                    <td className="px-4 py-3 text-gh-muted">{p.tipo === "par_cross" ? "Cross-ministério" : "Par"}</td>
                    <td className="px-4 py-3 text-gh-muted">{p.ministerio ? (LABELS_MIN[p.ministerio] ?? p.ministerio) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 font-medium ${
                        (p.ativo ?? true)
                          ? "bg-gh-green/15 text-gh-green"
                          : "bg-gh-red/15 text-gh-red"
                      }`}>
                        {(p.ativo ?? true) ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setEditandoPar({
                            id: p.id,
                            membro_1: p.membro_1,
                            membro_2: p.membro_2,
                            tipo: (p.tipo as "par" | "par_cross") ?? "par",
                            ministerio: p.ministerio,
                            ativo: p.ativo ?? true,
                          })}
                          className={actionEditar}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleParAtivo(p)}
                          className={(p.ativo ?? true) ? actionDesativar : actionAtivar}
                        >
                          {(p.ativo ?? true) ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pares.length && (
              <p className="px-4 py-10 text-center text-gh-muted text-sm">Nenhuma dupla cadastrada.</p>
            )}
            {!!pares.length && !paresFiltrados.length && (
              <p className="px-4 py-10 text-center text-gh-muted text-sm">Nenhuma dupla corresponde a estes filtros.</p>
            )}
          </div>
      </div>
    </div>
  )
}
