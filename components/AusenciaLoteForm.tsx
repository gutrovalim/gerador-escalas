"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { dataIsoParaExibicao } from "@/lib/formato-br"
import type { EscopoAusencia } from "@/lib/scheduler/types"

type LinhaCulto = { data: string; turnos: string[] }
type EventoOp = { id: string; nome: string; data: string }

const inputCls =
  "bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
const labelCls = "block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide"
const tabBase =
  "rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gh-accent/50"
const tabAtivo = "bg-gh-accent text-white"
const tabInativo = "bg-gh-surface-2 text-gh-muted border border-gh-border hover:text-gh-text"

type Props = {
  voluntarioId: string
  eventos: EventoOp[]
  onSalvo: () => void
  onCancelar: () => void
}

function diaISO(d: string): string {
  return d.slice(0, 10)
}

function agregarTurnosCulto(linhas: LinhaCulto[]): Map<string, string[]> {
  const porData = new Map<string, Set<string>>()
  for (const ln of linhas) {
    const d = ln.data?.trim()
    if (!d) continue
    if (!porData.has(d)) porData.set(d, new Set())
    const s = porData.get(d)!
    if (ln.turnos.length === 0) {
      s.add("manha")
      s.add("noite")
    } else {
      for (const t of ln.turnos) s.add(t)
    }
  }
  const out = new Map<string, string[]>()
  for (const [d, set] of porData) {
    out.set(d, [...set].sort())
  }
  return out
}

export function AusenciaLoteForm({ voluntarioId, eventos, onSalvo, onCancelar }: Props) {
  const [painel, setPainel] = useState<"cultos" | "eventos">("cultos")
  const [linhasCulto, setLinhasCulto] = useState<LinhaCulto[]>(() => [{ data: "", turnos: [] }])
  const [idsEvento, setIdsEvento] = useState<Set<string>>(() => new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const evPorId = useMemo(() => new Map(eventos.map(e => [e.id, e])), [eventos])

  function toggleTurno(li: number, turno: string) {
    setLinhasCulto(prev =>
      prev.map((row, i) => {
        if (i !== li) return row
        const turnos = row.turnos.includes(turno)
          ? row.turnos.filter(x => x !== turno)
          : [...row.turnos, turno]
        return { ...row, turnos }
      }),
    )
  }

  function toggleEvento(evId: string) {
    setIdsEvento(prev => {
      const next = new Set(prev)
      if (next.has(evId)) next.delete(evId)
      else next.add(evId)
      return next
    })
  }

  function adicionarLinhaCulto() {
    setLinhasCulto(prev => [...prev, { data: "", turnos: [] }])
  }

  function removerLinhaCulto(i: number) {
    setLinhasCulto(prev => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    const supabase = createClient()

    const inserir: Array<{
      voluntario_id: string
      data: string
      turnos: string[]
      escopo: EscopoAusencia
    }> = []

    if (painel === "cultos") {
      const mapa = agregarTurnosCulto(linhasCulto)
      if (mapa.size === 0) {
        setErro("Indique pelo menos uma data de culto (domingo).")
        setSalvando(false)
        return
      }
      for (const [data, turnos] of mapa) {
        inserir.push({ voluntario_id: voluntarioId, data, turnos, escopo: "cultos" })
      }
    } else {
      const datas = new Set<string>()
      for (const id of idsEvento) {
        const ev = evPorId.get(id)
        if (ev) datas.add(diaISO(ev.data))
      }
      if (datas.size === 0) {
        setErro("Selecione pelo menos um evento.")
        setSalvando(false)
        return
      }
      for (const data of datas) {
        inserir.push({ voluntario_id: voluntarioId, data, turnos: [], escopo: "eventos" })
      }
    }

    const { error } = await supabase.from("indisponibilidades").insert(inserir)
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onSalvo()
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-5">
      <div>
        <p className="text-xs text-gh-muted mb-2">Escolha o tipo e preencha; pode salvar um painel de cada vez.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${tabBase} ${painel === "cultos" ? tabAtivo : tabInativo}`}
            onClick={() => setPainel("cultos")}
          >
            Cultos (domingo)
          </button>
          <button
            type="button"
            className={`${tabBase} ${painel === "eventos" ? tabAtivo : tabInativo}`}
            onClick={() => setPainel("eventos")}
          >
            Eventos
          </button>
        </div>
      </div>

      {painel === "cultos" && (
        <div className="space-y-4">
          <p className="text-sm text-gh-muted">
            Uma linha por data. Várias linhas serão gravadas de uma vez. Turnos vazios = dia inteiro (manhã e noite).
          </p>
          {linhasCulto.map((row, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end border border-gh-border rounded-lg p-3 bg-gh-surface-2/30"
            >
              <div className="min-w-[10rem]">
                <label className={labelCls}>Data</label>
                <input
                  type="date"
                  value={row.data}
                  onChange={e => {
                    const v = e.target.value
                    setLinhasCulto(prev => prev.map((r, j) => (j === i ? { ...r, data: v } : r)))
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <span className={labelCls}>Turnos</span>
                <div className="flex gap-4">
                  {[{ val: "manha", label: "Manhã" }, { val: "noite", label: "Noite" }].map(({ val, label }) => (
                    <label key={val} className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.turnos.includes(val)}
                        onChange={() => toggleTurno(i, val)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removerLinhaCulto(i)}
                className="text-sm text-gh-red hover:underline self-end sm:self-auto"
                disabled={linhasCulto.length <= 1}
              >
                Remover linha
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={adicionarLinhaCulto}
            className="text-sm text-gh-accent hover:underline"
          >
            + Adicionar outra data
          </button>
        </div>
      )}

      {painel === "eventos" && (
        <div className="space-y-3">
          <p className="text-sm text-gh-muted">
            Marque os eventos em que não poderá servir. No mesmo dia, basta um registo para todos os eventos desse dia.
          </p>
          {eventos.length === 0 ? (
            <p className="text-sm text-gh-yellow border border-gh-yellow/30 rounded-lg px-3 py-2 bg-gh-yellow/10">
              Não há eventos futuros no calendário. Cadastre eventos em Eventos ou use o painel de cultos.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gh-border p-3 space-y-2.5 bg-gh-surface-2/30">
              {eventos.map(ev => {
                const iso = diaISO(ev.data)
                return (
                  <label
                    key={ev.id}
                    className="flex items-start gap-3 text-sm text-gh-text cursor-pointer rounded-md px-1 py-0.5 hover:bg-gh-surface-2/50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={idsEvento.has(ev.id)}
                      onChange={() => toggleEvento(ev.id)}
                    />
                    <span>
                      <span className="font-medium text-gh-text">{dataIsoParaExibicao(iso)}</span>
                      <span className="text-gh-muted"> — </span>
                      {ev.nome}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {erro && (
        <div className="border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-3 py-2 text-sm text-gh-red">
          {erro}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={salvando || (painel === "eventos" && eventos.length === 0)}
          className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] disabled:opacity-50 transition-colors"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="border border-gh-border rounded-lg px-4 py-2 text-sm text-gh-muted hover:text-gh-text hover:bg-gh-surface-2 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
