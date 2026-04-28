"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { MesPicker } from "@/components/MesPicker"
import { dataIsoDia } from "@/lib/mes"
import { dataIsoParaExibicao } from "@/lib/formato-br"
import type { ColunaAusencia } from "./types"

interface Voluntario { id: string; nome: string; ministerio: string; ativo: boolean }
interface Ausencia { id: string; voluntario_id: string; data: string; turnos: string[] }

const selectCls =
  "bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent"

function turnosDe(a: Ausencia): string[] {
  return Array.isArray(a.turnos) ? a.turnos : []
}

export function AusenciasOverviewClient({
  mes,
  ministerio,
  voluntarios,
  ausencias,
  colunas,
}: {
  mes: string
  ministerio: string
  voluntarios: Voluntario[]
  ausencias: Ausencia[]
  colunas: ColunaAusencia[]
}) {
  const router = useRouter()

  function pushQuery(next: { mes?: string; ministerio?: string }) {
    const m = next.mes ?? mes
    const min = next.ministerio ?? ministerio
    const p = new URLSearchParams()
    p.set("mes", m)
    if (min !== "todos") p.set("ministerio", min)
    router.push(`/indisponibilidades?${p.toString()}`)
  }

  function inds(volId: string, data: string): Ausencia[] {
    const dia = dataIsoDia(data)
    return ausencias.filter(i => i.voluntario_id === volId && dataIsoDia(i.data) === dia)
  }

  function tagsCelula(ist: Ausencia[]): { label: string; cls: string }[] {
    if (!ist.length) return []
    if (ist.some(i => !turnosDe(i).length)) {
      return [{ label: "Dia", cls: "bg-gh-red/15 text-gh-red border border-gh-red/30" }]
    }
    const t = new Set(ist.flatMap(i => turnosDe(i)))
    if (t.has("manha") && t.has("noite")) {
      return [{ label: "Dia", cls: "bg-gh-red/15 text-gh-red border border-gh-red/30" }]
    }
    const out: { label: string; cls: string }[] = []
    if (t.has("manha")) out.push({ label: "Manhã", cls: "bg-gh-yellow/15 text-gh-yellow border border-gh-yellow/30" })
    if (t.has("noite")) out.push({ label: "Noite", cls: "bg-gh-yellow/15 text-gh-yellow border border-gh-yellow/30" })
    return out
  }

  function tooltipCelula(ist: Ausencia[]): string {
    if (!ist.length) return "Disponível"
    if (ist.some(i => !turnosDe(i).length)) return "Dia inteiro"
    const t = new Set(ist.flatMap(i => turnosDe(i)))
    if (t.has("manha") && t.has("noite")) return "Dia inteiro (manhã e noite)"
    const parts = [
      t.has("manha") ? "Manhã" : null,
      t.has("noite") ? "Noite" : null,
    ].filter(Boolean) as string[]
    return parts.length ? parts.join(" + ") : "Parcial"
  }

  function rotuloColuna(c: ColunaAusencia): string {
    if (c.domingo) return "Culto (domingo)"
    if (c.evento) return c.nomeEvento?.trim() || "Evento"
    return "—"
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gh-text">Ausências por mês</h1>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <MesPicker
          value={mes}
          onChange={ym => pushQuery({ mes: ym })}
          className={selectCls}
          aria-label="Mês de referência"
        />
        <select
          value={ministerio}
          onChange={e => pushQuery({ ministerio: e.target.value })}
          className={selectCls}
        >
          <option value="todos">Todos os ministérios</option>
          <option value="tecnica">Técnica</option>
          <option value="backstage">Backstage</option>
        </select>
      </div>

      <div className="bg-gh-surface border border-gh-border rounded-xl overflow-x-auto w-full">
        <table className="w-full min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gh-border px-4 py-3 bg-gh-surface-2 text-left text-xs text-gh-muted uppercase tracking-wide whitespace-nowrap min-w-[180px] max-w-[240px] w-[20%]">
                Voluntário
              </th>
              {colunas.map(c => {
                const sub = rotuloColuna(c) || "—"
                return (
                <th
                  key={c.key}
                  className="border border-gh-border px-2 py-2 bg-gh-surface-2 text-center text-xs text-gh-muted min-w-[72px] max-w-[11rem]"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-medium text-gh-text whitespace-nowrap">{dataIsoParaExibicao(c.iso)}</span>
                    <span
                      className="text-[10px] text-gh-muted font-normal normal-case tracking-normal leading-tight text-center line-clamp-2 w-full"
                      title={sub !== "—" ? sub : undefined}
                    >
                      {sub}
                    </span>
                  </div>
                </th>
                )
              })}
              <th className="border border-gh-border px-2 py-3 bg-gh-surface-2 text-xs text-gh-muted text-center whitespace-nowrap w-16 min-w-[4rem]" />
            </tr>
          </thead>
          <tbody>
            {voluntarios.map(v => (
              <tr key={v.id} className="hover:bg-gh-surface-2/30 transition-colors">
                <td className="border border-gh-border px-4 py-2.5 font-medium text-gh-text truncate" title={v.nome}>{v.nome}</td>
                {colunas.map(c => {
                  const ist = inds(v.id, c.iso)
                  const tags = tagsCelula(ist)
                  return (
                    <td
                      key={c.key}
                      className="border border-gh-border px-1.5 py-2.5 align-middle text-center text-xs text-gh-text"
                      title={tooltipCelula(ist)}
                    >
                      {tags.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {tags.map(t => (
                            <span key={t.label} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none ${t.cls}`}>
                              {t.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gh-muted/70">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="border border-gh-border px-2 py-2.5 text-center align-middle">
                  <Link href={`/voluntarios/${v.id}/indisponibilidades`} className="text-xs text-gh-accent hover:underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
