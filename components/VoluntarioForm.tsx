"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ConfirmDialog"

const PAPEIS_TECNICA = ["audio", "projecao", "iluminacao"]
const PAPEIS_BACKSTAGE = ["palco", "tecnica_bs"]
const LABELS_PAPEL: Record<string, string> = {
  audio: "Áudio",
  projecao: "Projeção",
  iluminacao: "Iluminação",
  palco: "Palco",
  tecnica_bs: "Técnica (BS)",
}
const LABELS_RESTRICAO: Record<string, string> = {
  somente_manha: "Somente Manhã",
  somente_noite: "Somente Noite",
  apenas_manual: "Apenas Manual",
}

interface Props {
  initial?: {
    id?: string
    nome?: string
    ministerio?: string
    papeis?: string[]
    treinamento?: string[]
    restricoes?: string[]
    ativo?: boolean
  }
  onSalvo: () => void
  onCancelar: () => void
}

const inputCls = "w-full bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text placeholder-gh-muted focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
const labelCls = "block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide"

function CheckGroup({
  items,
  selected,
  onChange,
}: {
  items: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val])
  }
  return (
    <div className="flex gap-4 flex-wrap">
      {items.map(p => (
        <label key={p} className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(p)}
            onChange={() => toggle(p)}
            className="rounded"
          />
          {LABELS_PAPEL[p] ?? p}
        </label>
      ))}
    </div>
  )
}

export function VoluntarioForm({ initial = {}, onSalvo, onCancelar }: Props) {
  const { confirm, dialog } = useConfirm()
  const [nome, setNome] = useState(initial.nome ?? "")
  const [ministerio, setMinisterio] = useState(initial.ministerio ?? "tecnica")
  const [papeis, setPapeis] = useState<string[]>(initial.papeis ?? [])
  const [treinamento, setTreinamento] = useState<string[]>(initial.treinamento ?? [])
  const [restricoes, setRestricoes] = useState<string[]>(initial.restricoes ?? [])
  const [ativo, setAtivo] = useState(initial.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const papeisDisponiveis = ministerio === "tecnica" ? PAPEIS_TECNICA : PAPEIS_BACKSTAGE

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) { setErro("Nome é obrigatório."); return }
    if (!papeis.length && !treinamento.length) {
      setErro("Selecione ao menos um papel em «Papéis» ou em «Em treinamento».")
      return
    }
    setSalvando(true)
    const supabase = createClient()
    const payload = { nome: nome.trim(), ministerio, papeis, treinamento, restricoes, ativo }
    const { error } = initial.id
      ? await supabase.from("voluntarios").update(payload).eq("id", initial.id)
      : await supabase.from("voluntarios").insert(payload)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelCls}>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="Nome completo" />
      </div>

      <div>
        <label className={labelCls}>Ministério</label>
        <select
          value={ministerio}
          onChange={e => { setMinisterio(e.target.value); setPapeis([]); setTreinamento([]) }}
          className={inputCls}
        >
          <option value="tecnica">Técnica</option>
          <option value="backstage">Backstage</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Papéis</label>
        <CheckGroup items={papeisDisponiveis} selected={papeis} onChange={setPapeis} />
      </div>

      <div>
        <label className={labelCls}>Em treinamento</label>
        <CheckGroup items={papeisDisponiveis} selected={treinamento} onChange={setTreinamento} />
      </div>

      <div>
        <label className={labelCls}>Restrições</label>
        <div className="flex gap-4 flex-wrap">
          {Object.entries(LABELS_RESTRICAO).map(([val, label]) => (
            <label key={val} className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
              <input
                type="checkbox"
                checked={restricoes.includes(val)}
                onChange={() => setRestricoes(r => r.includes(val) ? r.filter(x => x !== val) : [...r, val])}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
          <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
          Ativo
        </label>
      </div>

      {erro && (
        <div className="border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-3 py-2 text-sm text-gh-red">
          {erro}
        </div>
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
