"use client"

import { Fragment, type ReactNode } from "react"
import { dataIsoDiaMesSomente, intervaloHorarioEvento } from "@/lib/formato-br"
import { voluntariosElegiveisParaSlot } from "@/lib/escala-voluntarios"
import type { Ausencia, TipoCulto } from "@/lib/scheduler/types"

interface Alocacao {
  id: string
  voluntario_id: string | null
  papel: string
  trainee: boolean
  fixada: boolean
}

interface Culto {
  data: string
  tipo: string
  nome?: string
  ministerio: string
  horario_inicio?: string
  horario_fim?: string
  alocacoes: Alocacao[]
}

type VoluntarioLinha = {
  id: string
  nome: string
  ministerio: string
  papeis: string[] | null
  treinamento: string[] | null
  ativo: boolean | null
}

interface Props {
  cultos: Culto[]
  ministerio: string
  nomesPorId: Record<string, string>
  editando?: boolean
  voluntarios?: VoluntarioLinha[]
  draftVoluntarios?: Record<string, string>
  onMudarVoluntario?: (alocacaoId: string, voluntarioId: string) => void
  /** Ausências do mês; usado na edição para não oferecer voluntários indisponíveis no culto. */
  ausencias?: Ausencia[]
}

const LABELS_PAPEL: Record<string, string> = {
  audio: "SOM",
  projecao: "PROJEÇÃO",
  iluminacao: "ILUMINAÇÃO",
  palco: "PALCO",
  tecnica_bs: "TÉCNICA",
}

const selectCelula =
  "max-w-[220px] min-w-[140px] w-full bg-gh-surface-2 border border-gh-border rounded-lg px-2 py-1.5 text-sm text-gh-text focus:outline-none focus:border-gh-accent"

export function EscalaTable({
  cultos,
  ministerio,
  nomesPorId,
  editando = false,
  voluntarios = [],
  draftVoluntarios = {},
  onMudarVoluntario,
  ausencias = [],
}: Props) {
  const min = ministerio as "tecnica" | "backstage"

  const cultosMin = cultos.filter(c => c.ministerio === ministerio)
  const dominicaisManha = cultosMin.filter(c => c.tipo === "dominical_manha").sort((a, b) => a.data.localeCompare(b.data))
  const dominicaisNoite = cultosMin.filter(c => c.tipo === "dominical_noite").sort((a, b) => a.data.localeCompare(b.data))
  const especiais = cultosMin.filter(c => c.tipo === "especial").sort((a, b) => a.data.localeCompare(b.data))

  const papeis = ["audio", "projecao", "iluminacao", "palco", "tecnica_bs"].filter(p =>
    cultosMin.some(c => c.alocacoes.some(a => a.papel === p)),
  )

  function nomePorId(id: string): string {
    if (!id) return "—"
    return nomesPorId[id] ?? id
  }

  function valorVoluntario(a: Alocacao): string {
    return draftVoluntarios[a.id] ?? a.voluntario_id ?? ""
  }

  function slotCulto(c: Culto): { data: string; tipo: TipoCulto } {
    return { data: c.data, tipo: c.tipo as TipoCulto }
  }

  function renderCelulaPrim(als: Alocacao[], culto: Culto) {
    if (!editando) {
      return (
        <>
          {als.map((a, j) => (
            <span
              key={`${a.id}-${j}`}
              className={a.fixada ? "text-gh-yellow" : ""}
            >
              {nomePorId(a.voluntario_id ?? "")}
            </span>
          ))}
        </>
      )
    }
    const slot = slotCulto(culto)
    return (
      <div className="flex flex-col gap-1.5 items-center">
        {als.map(a => {
          const vAtual = valorVoluntario(a)
          const opcoes = voluntariosElegiveisParaSlot(
            min,
            a.papel,
            false,
            voluntarios,
            vAtual,
            slot,
            ausencias,
          )
          return (
            <select
              key={a.id}
              className={selectCelula}
              value={vAtual}
              aria-label={`Papel ${LABELS_PAPEL[a.papel] ?? a.papel}`}
              onChange={e => onMudarVoluntario?.(a.id, e.target.value)}
            >
              <option value="">— Sem voluntário —</option>
              {opcoes.map(v => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          )
        })}
      </div>
    )
  }

  function renderCelulaTrain(als: Alocacao[], culto: Culto) {
    if (!editando) {
      return als.map(a => nomePorId(a.voluntario_id ?? "")).join(", ")
    }
    const slot = slotCulto(culto)
    return (
      <div className="flex flex-col gap-1.5 items-center">
        {als.map(a => {
          const vAtual = valorVoluntario(a)
          const opcoes = voluntariosElegiveisParaSlot(
            min,
            a.papel,
            true,
            voluntarios,
            vAtual,
            slot,
            ausencias,
          )
          return (
            <select
              key={a.id}
              className={selectCelula}
              value={vAtual}
              aria-label={`Trainee ${LABELS_PAPEL[a.papel] ?? a.papel}`}
              onChange={e => onMudarVoluntario?.(a.id, e.target.value)}
            >
              <option value="">— Sem voluntário —</option>
              {opcoes.map(v => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          )
        })}
      </div>
    )
  }

  function renderSecao(titulo: string, lista: Culto[], colunaLabel: (c: Culto) => ReactNode) {
    if (!lista.length) return null
    return (
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gh-muted uppercase tracking-wide mb-3">{titulo}</h3>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-auto">
            <thead>
              <tr>
                <th className="border border-gh-border px-4 py-2 bg-gh-surface-2 text-left text-gh-muted text-xs uppercase tracking-wide min-w-[110px]">
                  Papel
                </th>
                {lista.map(c => (
                  <th
                    key={`${c.data}|${c.tipo}|${c.nome ?? ""}`}
                    className="border border-gh-border px-4 py-2 bg-gh-surface-2 text-center text-gh-muted text-xs min-w-[130px]"
                  >
                    {colunaLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {papeis.map(papel => {
                const prims = lista.map(c => c.alocacoes.filter(a => a.papel === papel && !a.trainee))
                const trains = lista.map(c => c.alocacoes.filter(a => a.papel === papel && a.trainee))
                const temTrainee = trains.some(t => t.length > 0)
                return (
                  <Fragment key={papel}>
                    <tr className="hover:bg-gh-surface-2/50">
                      <td className="border border-gh-border px-4 py-2.5 font-medium text-gh-muted text-xs uppercase tracking-wide">
                        {LABELS_PAPEL[papel] ?? papel}
                      </td>
                      {prims.map((als, i) => (
                        <td key={i} className="border border-gh-border px-4 py-2.5 text-center text-gh-text align-top">
                          {renderCelulaPrim(als, lista[i])}
                        </td>
                      ))}
                    </tr>
                    {temTrainee && (
                      <tr className="bg-gh-accent/5">
                        <td className="border border-gh-border px-4 py-1.5 text-xs text-gh-muted italic">trainee</td>
                        {trains.map((als, i) => (
                          <td key={i} className="border border-gh-border px-4 py-1.5 text-center text-xs text-gh-muted align-top">
                            {renderCelulaTrain(als, lista[i])}
                          </td>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const mostrarNoite =
    dominicaisNoite.length > 0 &&
    JSON.stringify(dominicaisNoite.map(c => c.alocacoes)) !== JSON.stringify(dominicaisManha.map(c => c.alocacoes))

  function rotuloColunaEvento(c: Culto) {
    const dia = dataIsoDiaMesSomente(c.data)
    const hrs = intervaloHorarioEvento(c.horario_inicio, c.horario_fim)
    return (
      <div className="max-w-[200px] mx-auto">
        <div className="font-medium text-gh-text leading-tight">{c.nome ?? "Evento"}</div>
        <div className="text-[11px] text-gh-muted mt-1 normal-case tracking-normal">
          {dia}
          {hrs ? ` · ${hrs}` : ""}
        </div>
      </div>
    )
  }

  return (
    <div>
      {renderSecao("Culto da Manhã (10h)", dominicaisManha, c => dataIsoDiaMesSomente(c.data))}
      {mostrarNoite && renderSecao("Culto da Noite (18h)", dominicaisNoite, c => dataIsoDiaMesSomente(c.data))}
      {renderSecao("Eventos", especiais, rotuloColunaEvento)}
    </div>
  )
}
