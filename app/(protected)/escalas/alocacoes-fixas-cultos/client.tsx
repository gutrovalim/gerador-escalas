"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { chaveSlotFixaCulto } from "@/lib/fixas-culto-mapa"
import { gerarCultosDoMes } from "@/lib/scheduler/calendar"
import type { Evento, MinisterioSlug, PapelSlug } from "@/lib/scheduler/types"
import { MesPicker } from "@/components/MesPicker"
import { dataIsoParaExibicao } from "@/lib/formato-br"
import { mesReferenciaTituloPt } from "@/lib/mes"

const PAPEIS_TECNICA: PapelSlug[] = ["audio", "projecao", "iluminacao"]
const PAPEIS_BACKSTAGE: PapelSlug[] = ["palco", "tecnica_bs"]

const LABEL_PAPEL: Record<string, string> = {
  audio: "Áudio",
  projecao: "Projeção",
  iluminacao: "Iluminação",
  palco: "Palco",
  tecnica_bs: "Técnica (BS)",
}

const TURNO: Record<string, string> = {
  dominical_manha: "Culto manhã (10h)",
  dominical_noite: "Culto noite (18h)",
}

const inputCls =
  "w-full min-w-0 bg-gh-surface-2 border border-gh-border rounded-lg px-2 py-1.5 text-sm text-gh-text focus:outline-none focus:border-gh-accent"
const selectCls = "bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text"

type Vol = { id: string; nome: string; ministerio: string; papeis: string[] | null; ativo: boolean }

function papeisMin(m: MinisterioSlug) {
  return m === "tecnica" ? PAPEIS_TECNICA : PAPEIS_BACKSTAGE
}

function volsParaPapel(vols: Vol[], m: MinisterioSlug, papel: PapelSlug, selecionadoId: string | undefined) {
  return vols.filter(v => {
    if (v.ministerio !== m) return false
    if (selecionadoId && v.id === selecionadoId) return true
    if (!v.ativo) return false
    const p = v.papeis ?? []
    return p.includes(papel)
  })
}

export function FixasCultoClient({
  mes: mesIn,
  ministerio: minIn,
  eventosCalendario,
  voluntarios,
  fixasInicial,
}: {
  mes: string
  ministerio: MinisterioSlug
  eventosCalendario: Evento[]
  voluntarios: Vol[]
  fixasInicial: Array<Record<string, unknown>>
}) {
  const router = useRouter()
  const [mesSel, setMesSel] = useState(mesIn)
  const [minSel, setMinSel] = useState(minIn)
  const synced = mesIn === mesSel && minIn === minSel

  /** slotKey → papel → voluntário id */
  const inicialMap = useMemo(() => {
    const o: Record<string, Record<string, string>> = {}
    const min = minIn
    for (const r of fixasInicial) {
      const data = String(r.data ?? "").slice(0, 10)
      const tipo = String(r.tipo_culto ?? "")
      if ((tipo !== "dominical_manha" && tipo !== "dominical_noite") || !data) continue
      const papel = String(r.papel ?? "")
      const vid = String(r.voluntario_id ?? "")
      const slotKey = chaveSlotFixaCulto(data, tipo as "dominical_manha" | "dominical_noite", min)
      if (!o[slotKey]) o[slotKey] = {}
      if (vid) o[slotKey][papel] = vid
    }
    return o
  }, [fixasInicial, minIn])

  const [fixasVol, setFixasVol] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    setFixasVol(inicialMap)
  }, [inicialMap])

  const slots = useMemo(() => {
    const ministerio = minSel
    const lista = gerarCultosDoMes(mesSel, eventosCalendario).filter(
      c =>
        c.ministerio === ministerio &&
        (c.tipo === "dominical_manha" || c.tipo === "dominical_noite"),
    )
    const visto = new Set<string>()
    const sec: { data: string; tipo: "dominical_manha" | "dominical_noite"; slotKey: string }[] = []
    for (const c of lista) {
      const slotKey = chaveSlotFixaCulto(
        c.data,
        c.tipo as "dominical_manha" | "dominical_noite",
        ministerio,
      )
      if (visto.has(slotKey)) continue
      visto.add(slotKey)
      sec.push({
        data: c.data.slice(0, 10),
        tipo: c.tipo as "dominical_manha" | "dominical_noite",
        slotKey,
      })
    }
    sec.sort((a, b) =>
      a.data !== b.data ? a.data.localeCompare(b.data) : a.tipo.localeCompare(b.tipo),
    )
    return sec
  }, [mesSel, minSel, eventosCalendario])

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const papeis = papeisMin(minSel)

  function setPapel(slotKey: string, papel: string, volId: string) {
    setFixasVol(prev => {
      const base = prev[slotKey] ? { ...prev[slotKey] } : {}
      if (!volId) delete base[papel]
      else base[papel] = volId
      const next = { ...prev, [slotKey]: base }
      if (Object.keys(base).length === 0) {
        const { [slotKey]: _, ...rest } = next
        return rest
      }
      return next
    })
  }

  async function salvar() {
    if (!synced) return
    setSalvando(true)
    setErro(null)
    const supabase = createClient()
    const min = minSel
    const { error: errDel } = await supabase
      .from("alocacoes_fixas_culto")
      .delete()
      .eq("mes", mesSel)
      .eq("ministerio", min)
    if (errDel) {
      setErro(errDel.message)
      setSalvando(false)
      return
    }
    const linhas: { mes: string; data: string; tipo_culto: string; ministerio: string; papel: string; voluntario_id: string }[] = []
    for (const s of slots) {
      const m = fixasVol[s.slotKey] ?? {}
      for (const p of papeis) {
        const vid = m[p]?.trim()
        if (vid) {
          linhas.push({
            mes: mesSel,
            data: s.data,
            tipo_culto: s.tipo,
            ministerio: min,
            papel: p,
            voluntario_id: vid,
          })
        }
      }
    }
    if (linhas.length) {
      const { error: errIns } = await supabase.from("alocacoes_fixas_culto").insert(linhas)
      if (errIns) {
        setErro(errIns.message)
        setSalvando(false)
        return
      }
    }
    setSalvando(false)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link href={`/escalas?mes=${encodeURIComponent(mesSel)}&ministerio=${encodeURIComponent(minSel)}`} className="text-sm text-gh-accent hover:underline mb-2 inline-block">
            ← Voltar às escalas
          </Link>
          <h1 className="text-2xl font-semibold text-gh-text">Alocações fixas em cultos (domingo)</h1>
          <p className="text-sm text-gh-muted mt-1 max-w-2xl">
            Defina quem fica fixo em cada culto manhã/noite do mês. Valores são usados na geração automática
            (junto com as regras do algoritmo). {mesReferenciaTituloPt(mesSel)} ·{" "}
            {minSel === "tecnica" ? "Técnica" : "Backstage"}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <MesPicker
          value={mesSel}
          onChange={ym => {
            setMesSel(ym)
            router.push(`/escalas/alocacoes-fixas-cultos?mes=${encodeURIComponent(ym)}&ministerio=${encodeURIComponent(minSel)}`)
          }}
          className={selectCls}
          aria-label="Mês de referência"
        />
        <select
          value={minSel}
          onChange={e => {
            const v = e.target.value as MinisterioSlug
            setMinSel(v)
            router.push(`/escalas/alocacoes-fixas-cultos?mes=${encodeURIComponent(mesSel)}&ministerio=${encodeURIComponent(v)}`)
          }}
          className={selectCls}
        >
          <option value="tecnica">Técnica</option>
          <option value="backstage">Backstage</option>
        </select>
        <button
          type="button"
          disabled={salvando || !synced}
          onClick={() => void salvar()}
          className="bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] disabled:opacity-50"
        >
          {salvando ? "A guardar…" : "Guardar"}
        </button>
      </div>

      {erro && (
        <div className="border-l-2 border-gh-red bg-gh-red/10 rounded-r-lg px-3 py-2 text-sm text-gh-red mb-4">{erro}</div>
      )}

      {!synced && <p className="text-sm text-gh-muted mb-4">A atualizar…</p>}

      <div className="space-y-6">
        {slots.map(s => (
          <div
            key={s.slotKey}
            className="bg-gh-surface border border-gh-border rounded-xl p-4 space-y-3"
          >
            <div className="text-sm font-medium text-gh-text">
              {dataIsoParaExibicao(s.data)} — {TURNO[s.tipo] ?? s.tipo}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {papeis.map(papel => (
                <div key={papel}>
                  <label className="block text-xs font-medium text-gh-muted mb-1 uppercase tracking-wide">
                    {LABEL_PAPEL[papel] ?? papel}
                  </label>
                  <select
                    className={inputCls}
                    value={fixasVol[s.slotKey]?.[papel] ?? ""}
                    onChange={e => setPapel(s.slotKey, papel, e.target.value)}
                  >
                    <option value="">— Nenhum —</option>
                    {volsParaPapel(voluntarios, minSel, papel, fixasVol[s.slotKey]?.[papel]).map(v => (
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
        {!slots.length && synced && (
          <p className="text-sm text-gh-muted">Não há domingos com culto na geração do calendário para este mês.</p>
        )}
      </div>
    </div>
  )
}
