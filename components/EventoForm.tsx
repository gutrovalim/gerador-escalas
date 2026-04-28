"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { horaBancoParaInputTime } from "@/lib/formato-br"
import type { PapelSlug } from "@/lib/scheduler/types"

const LABELS_PAPEL: Record<string, string> = {
  audio: "Áudio",
  projecao: "Projeção",
  iluminacao: "Iluminação",
  palco: "Palco",
  tecnica_bs: "Técnica (BS)",
}
const TODOS_PAPEIS = ["audio", "projecao", "iluminacao", "palco", "tecnica_bs"]
const PAPEIS_TEC: PapelSlug[] = ["audio", "projecao", "iluminacao"]
const PAPEIS_BS: PapelSlug[] = ["palco", "tecnica_bs"]

/** Papéis do ministério para a secção de alocações fixas: sempre o conjunto completo se o ministério estiver no evento (independente dos checkboxes de «Papéis exigidos»). */
function papeisFixasPorMinisterio(min: "tecnica" | "backstage"): PapelSlug[] {
  return min === "tecnica" ? PAPEIS_TEC : PAPEIS_BS
}

function mapaFixasInicial(
  fixas: Array<{ papel: string; voluntario_id: string }> | undefined
): Record<string, string> {
  const o: Record<string, string> = {}
  for (const f of fixas ?? []) {
    o[f.papel] = f.voluntario_id
  }
  return o
}

/** Ministério + papel no cadastro; mantém o voluntário já escolhido ainda que o cadastro mude. */
function voluntariosParaFixa(
  lista: Array<{ id: string; nome: string; ministerio: string; papeis?: string[]; ativo?: boolean }>,
  min: "tecnica" | "backstage",
  papel: string,
  selecionadoId: string | undefined
) {
  return lista.filter(v => {
    if (v.ministerio !== min) return false
    if (selecionadoId && v.id === selecionadoId) return true
    if (v.ativo === false) return false
    const papeisV = Array.isArray(v.papeis) ? v.papeis : []
    return papeisV.includes(papel)
  })
}

interface Props {
  initial?: {
    id?: string
    nome?: string
    data?: string
    horario_inicio?: string
    horario_fim?: string
    ministerios?: string[]
    papeis?: string[]
    alocacoes_fixas?: Array<{ papel: string; voluntario_id: string }>
  }
  voluntarios: Array<{ id: string; nome: string; ministerio: string; papeis?: string[]; ativo?: boolean }>
  onSalvo: () => void
  onCancelar: () => void
}

const inputCls =
  "w-full bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text placeholder-gh-muted focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
const selectFixaCls =
  "flex-1 min-w-0 bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent"
const labelCls = "block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide"

export function EventoForm({ initial = {}, voluntarios, onSalvo, onCancelar }: Props) {
  const [nome, setNome] = useState(initial.nome ?? "")
  const [data, setData] = useState(initial.data ?? "")
  const [horarioInicio, setHorarioInicio] = useState(() => horaBancoParaInputTime(initial.horario_inicio))
  const [horarioFim, setHorarioFim] = useState(() => horaBancoParaInputTime(initial.horario_fim))
  const [ministerios, setMinisterios] = useState<string[]>(initial.ministerios ?? [])
  const [papeis, setPapeis] = useState<string[]>(initial.papeis ?? [])
  const [fixasVol, setFixasVol] = useState<Record<string, string>>(() => mapaFixasInicial(initial.alocacoes_fixas))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const linhasFixas = useMemo(() => {
    const out: { ministerio: "tecnica" | "backstage"; papel: PapelSlug }[] = []
    for (const m of ministerios) {
      if (m !== "tecnica" && m !== "backstage") continue
      for (const papel of papeisFixasPorMinisterio(m)) {
        out.push({ ministerio: m, papel })
      }
    }
    return out
  }, [ministerios])

  function toggleArr(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  function setFixaPapel(papel: string, voluntarioId: string) {
    setFixasVol(prev => {
      const next = { ...prev }
      if (!voluntarioId) delete next[papel]
      else next[papel] = voluntarioId
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) {
      setErro("Nome é obrigatório.")
      return
    }
    if (!data) {
      setErro("Data é obrigatória.")
      return
    }
    if (!horarioInicio) {
      setErro("Horário de início é obrigatório.")
      return
    }
    if (!ministerios.length) {
      setErro("Selecione ao menos um ministério.")
      return
    }
    setSalvando(true)
    const supabase = createClient()
    const papeisComFixas = new Set(papeis)
    for (const { papel } of linhasFixas) {
      const vid = fixasVol[papel]?.trim()
      if (vid) papeisComFixas.add(papel)
    }
    const payload = {
      nome: nome.trim(),
      data,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim || null,
      ministerios,
      papeis: [...papeisComFixas],
      pessoa_unica: false,
    }

    try {
      let eventoId = initial.id

      if (initial.id) {
        const { error } = await supabase.from("eventos").update(payload).eq("id", initial.id)
        if (error) {
          setErro(error.message)
          return
        }
        eventoId = initial.id
      } else {
        const { data: ins, error } = await supabase.from("eventos").insert(payload).select("id").single()
        if (error) {
          setErro(error.message)
          return
        }
        eventoId = ins!.id
      }

      await supabase.from("alocacoes_fixas").delete().eq("evento_id", eventoId)

      const linhas = linhasFixas
        .map(({ papel }) => {
          const vid = fixasVol[papel]?.trim()
          return vid ? { evento_id: eventoId, papel, voluntario_id: vid } : null
        })
        .filter((x): x is { evento_id: string; papel: PapelSlug; voluntario_id: string } => x != null)

      if (linhas.length) {
        const { error: errFix } = await supabase.from("alocacoes_fixas").insert(linhas)
        if (errFix) {
          setErro(errFix.message)
          return
        }
      }

      onSalvo()
    } finally {
      setSalvando(false)
    }
  }

  const minsOrdenados = useMemo(() => {
    const ord = ["tecnica", "backstage"] as const
    return ord.filter(m => linhasFixas.some(l => l.ministerio === m))
  }, [linhasFixas])

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelCls}>Nome do evento</label>
        <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="Ex: Copa da Onda" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Data</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Horário início</label>
          <input
            type="time"
            step={60}
            value={horarioInicio}
            onChange={e => setHorarioInicio(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Horário fim (opcional)</label>
        <input type="time" step={60} value={horarioFim} onChange={e => setHorarioFim(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Ministérios</label>
        <div className="flex gap-4">
          {[{ val: "tecnica", label: "Técnica" }, { val: "backstage", label: "Backstage" }].map(({ val, label }) => (
            <label key={val} className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
              <input type="checkbox" checked={ministerios.includes(val)} onChange={() => toggleArr(ministerios, setMinisterios, val)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Papéis exigidos</label>
        <div className="flex gap-3 flex-wrap">
          {TODOS_PAPEIS.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm text-gh-text cursor-pointer">
              <input type="checkbox" checked={papeis.includes(p)} onChange={() => toggleArr(papeis, setPapeis, p)} />
              {LABELS_PAPEL[p]}
            </label>
          ))}
        </div>
      </div>

      {minsOrdenados.length > 0 && (
        <div className="space-y-4 pt-1 border-t border-gh-border">
          <p className="text-sm font-medium text-gh-text">Alocações fixas (opcional)</p>
          <p className="text-xs text-gh-muted -mt-2">
            Por ministério e por papel: em cada linha só aparecem voluntários daquele ministério que têm aquele papel no cadastro. Inclui todos os papéis de cada ministério marcado acima; ao guardar, um papel só com alocação fixa passa a constar também em «Papéis exigidos» para a geração aplicar a fixa.
          </p>
          {minsOrdenados.map(min => (
            <div key={min} className="space-y-2">
              <p className="text-xs font-semibold text-gh-muted uppercase tracking-wide">
                {min === "tecnica" ? "Técnica" : "Backstage"}
              </p>
              <div className="space-y-2 pl-0">
                {linhasFixas
                  .filter(l => l.ministerio === min)
                  .map(({ papel }) => (
                    <div key={papel} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <span className="text-sm text-gh-text shrink-0 w-36">{LABELS_PAPEL[papel] ?? papel}</span>
                      <select
                        value={fixasVol[papel] ?? ""}
                        onChange={e => setFixaPapel(papel, e.target.value)}
                        className={selectFixaCls}
                      >
                        <option value="">— Nenhum —</option>
                        {voluntariosParaFixa(voluntarios, min, papel, fixasVol[papel]).map(v => (
                          <option key={v.id} value={v.id}>
                            {v.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
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
