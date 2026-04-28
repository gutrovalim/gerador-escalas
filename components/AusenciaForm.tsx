"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { EscopoAusencia } from "@/lib/scheduler/types"

interface Props {
  voluntarioId: string
  initial?: { id?: string; data?: string; turnos?: string[]; escopo?: EscopoAusencia }
  onSalvo: () => void
  onCancelar: () => void
}

const inputCls =
  "bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
const selectCls =
  "w-full bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
const labelCls = "block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide"

export function AusenciaForm({ voluntarioId, initial = {}, onSalvo, onCancelar }: Props) {
  const [data, setData] = useState(initial.data ?? "")
  const [turnos, setTurnos] = useState<string[]>(initial.turnos ?? [])
  const [escopo, setEscopo] = useState<EscopoAusencia>(initial.escopo ?? "ambos")
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function toggleTurno(turno: string) {
    setTurnos(t => (t.includes(turno) ? t.filter(x => x !== turno) : [...t, turno]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!data) {
      setErro("Data é obrigatória.")
      return
    }
    if (escopo === "eventos" && turnos.length > 0) {
      setErro("Ausências só de evento não usam turnos; limpe os turnos ou altere o tipo.")
      return
    }
    setSalvando(true)
    const supabase = createClient()
    const turnosPayload = escopo === "eventos" ? [] : turnos
    const payload = {
      voluntario_id: voluntarioId,
      data,
      turnos: turnosPayload,
      escopo,
    }
    const { error } = initial.id
      ? await supabase.from("indisponibilidades").update(payload).eq("id", initial.id)
      : await supabase.from("indisponibilidades").insert(payload)
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onSalvo()
  }

  const descricao =
    escopo === "eventos"
      ? "Indisponível nos cultos especiais deste dia"
      : turnos.length === 0
        ? "Dia inteiro bloqueado (cultos)"
        : `Bloqueado: ${turnos.map(t => (t === "manha" ? "Manhã" : "Noite")).join(" e ")}`

  const cultoCampos = escopo !== "eventos"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelCls}>Tipo</label>
        <select value={escopo} onChange={e => setEscopo(e.target.value as EscopoAusencia)} className={selectCls}>
          <option value="ambos">Cultos e eventos (legado)</option>
          <option value="cultos">Só cultos de domingo</option>
          <option value="eventos">Só eventos no dia</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Data</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputCls} />
      </div>

      {cultoCampos && (
        <div>
          <label className={labelCls}>Turnos bloqueados</label>
          <div className="flex gap-4 mb-2">
            {[{ val: "manha", label: "Manhã" }, { val: "noite", label: "Noite" }].map(({ val, label }) => (
              <label key={val} className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
                <input type="checkbox" checked={turnos.includes(val)} onChange={() => toggleTurno(val)} />
                {label}
              </label>
            ))}
          </div>
          <p className={`text-xs ${turnos.length === 0 ? "text-gh-red" : "text-gh-yellow"}`}>{descricao}</p>
          <p className="text-xs text-gh-muted mt-0.5">Deixe vazio para bloquear o dia inteiro nos cultos.</p>
        </div>
      )}

      {!cultoCampos && (
        <p className="text-xs text-gh-muted">{descricao}</p>
      )}

      {erro && (
        <div className="border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-3 py-2 text-sm text-gh-red">{erro}</div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={salvando}
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
