"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ConfirmDialog"
import { AusenciaForm } from "@/components/AusenciaForm"
import { AusenciaLoteForm } from "@/components/AusenciaLoteForm"
import { MesPicker } from "@/components/MesPicker"

interface Ausencia {
  id: string
  voluntario_id: string
  data: string
  turnos: string[]
  escopo?: string
}

type EventoList = { id: string; nome: string; data: string }

function badgeTurnos(escopo: string | undefined, turnos: string[]) {
  const e = escopo ?? "ambos"
  if (e === "eventos") {
    return <span className="text-xs rounded-full px-2.5 py-0.5 bg-gh-accent/15 text-gh-accent font-medium">Eventos</span>
  }
  if (!turnos.length) {
    return <span className="text-xs rounded-full px-2.5 py-0.5 bg-gh-red/15 text-gh-red font-medium">Dia inteiro</span>
  }
  const label = turnos.map(t => (t === "manha" ? "Manhã" : "Noite")).join(" e ")
  return (
    <span className="text-xs rounded-full px-2.5 py-0.5 bg-gh-yellow/15 text-gh-yellow font-medium">{label}</span>
  )
}

function labelTipo(escopo: string | undefined): string {
  switch (escopo ?? "ambos") {
    case "cultos":
      return "Cultos"
    case "eventos":
      return "Eventos"
    default:
      return "Cultos e eventos"
  }
}

export function AusenciasVolClient({
  voluntario,
  ausencias,
  eventos,
}: {
  voluntario: { id: string; nome: string }
  ausencias: Ausencia[]
  eventos: EventoList[]
}) {
  const [filtroMes, setFiltroMes] = useState("")
  const [editando, setEditando] = useState<Ausencia | null | "novo">(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { confirm, dialog } = useConfirm()

  const filtradas = ausencias.filter(i => !filtroMes || i.data.startsWith(filtroMes))

  async function excluir(ind: Ausencia) {
    const ok = await confirm({
      title: "Excluir ausência?",
      description: `Remover a indisponibilidade de ${voluntario.nome} em ${ind.data}?`,
      confirmLabel: "Excluir",
      variant: "danger",
    })
    if (!ok) return
    await supabase.from("indisponibilidades").delete().eq("id", ind.id)
    router.refresh()
  }

  return (
    <div>
      {dialog}
      <Link href="/indisponibilidades" className="text-sm text-gh-accent hover:underline mb-2 inline-block">
        ← Ausências por mês
      </Link>

      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h1 className="text-2xl font-semibold text-gh-text">Ausências</h1>
          <p className="text-gh-muted text-sm mt-0.5">{voluntario.nome}</p>
        </div>
        <button
          onClick={() => setEditando("novo")}
          className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] transition-colors"
        >
          + Adicionar
        </button>
      </div>

      {editando && (
        <div
          className={`bg-gh-surface border border-gh-border rounded-xl p-6 mb-6 ${editando === "novo" ? "max-w-xl" : "max-w-lg"}`}
        >
          <h2 className="font-semibold text-gh-text mb-4">
            {editando === "novo" ? "Novas ausências" : "Editar ausência"}
          </h2>
          {editando === "novo" ? (
            <AusenciaLoteForm
              voluntarioId={voluntario.id}
              eventos={eventos}
              onSalvo={() => {
                setEditando(null)
                router.refresh()
              }}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <AusenciaForm
              voluntarioId={voluntario.id}
              initial={{
                id: editando.id,
                data: editando.data,
                turnos: editando.turnos,
                escopo: (editando.escopo as "ambos" | "cultos" | "eventos" | undefined) ?? "ambos",
              }}
              onSalvo={() => {
                setEditando(null)
                router.refresh()
              }}
              onCancelar={() => setEditando(null)}
            />
          )}
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <MesPicker
          value={filtroMes}
          onChange={setFiltroMes}
          allowEmpty
          emptyLabel="Todos os meses"
          className="bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent min-w-[14rem]"
          aria-label="Filtrar por mês"
        />
        {filtroMes && (
          <button onClick={() => setFiltroMes("")} className="text-sm text-gh-muted hover:text-gh-text transition-colors">
            Limpar
          </button>
        )}
      </div>

      <div className="bg-gh-surface border border-gh-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gh-surface-2">
            <tr>
              {["Data", "Tipo", "Turnos / alcance", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gh-muted uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gh-border">
            {filtradas.map(ind => (
              <tr key={ind.id} className="hover:bg-gh-surface-2/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gh-text">{ind.data}</td>
                <td className="px-4 py-3 text-gh-muted text-xs">{labelTipo(ind.escopo)}</td>
                <td className="px-4 py-3">{badgeTurnos(ind.escopo, Array.isArray(ind.turnos) ? ind.turnos : [])}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setEditando(ind)}
                      className="text-xs text-gh-muted hover:text-gh-text transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluir(ind)}
                      className="text-xs text-gh-muted hover:text-gh-red transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtradas.length && (
          <p className="px-4 py-10 text-center text-gh-muted text-sm">Nenhuma ausência encontrada.</p>
        )}
      </div>
    </div>
  )
}
