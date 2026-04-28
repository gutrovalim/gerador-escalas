import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import {
  contarEscalasNoMes,
  limitesMes,
  normalizarMesParam,
} from "@/lib/analitico-stats"
import { MesSelector } from "./MesSelector"

export const metadata = {
  title: "Analítico",
}

export const dynamic = "force-dynamic"

function Card({
  titulo,
  valor,
  subtitulo,
}: {
  titulo: string
  valor: number | string
  subtitulo?: string
}) {
  return (
    <div className="bg-gh-surface border border-gh-border rounded-xl p-5 shadow-sm">
      <p className="text-xs font-medium text-gh-muted uppercase tracking-wide mb-1">{titulo}</p>
      <p className="text-3xl font-semibold text-gh-text tabular-nums">{valor}</p>
      {subtitulo && <p className="text-xs text-gh-muted mt-2">{subtitulo}</p>}
    </div>
  )
}

export default async function AnaliticoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes: mesRaw } = await searchParams
  const mesRef = normalizarMesParam(mesRaw)
  const { inicio, fim } = limitesMes(mesRef)

  const supabase = await createClient()

  const [
    volTotal,
    volTrainees,
    ausencias,
    escalasMes,
  ] = await Promise.all([
    supabase.from("voluntarios").select("id", { count: "exact", head: true }),
    supabase
      .from("voluntarios")
      .select("id", { count: "exact", head: true })
      .not("treinamento", "is", null)
      .not("treinamento", "eq", "[]"),
    supabase.from("indisponibilidades").select("id", { count: "exact", head: true }),
    contarEscalasNoMes(supabase, inicio, fim),
  ])

  const nVol = volTotal.count ?? 0
  const nTrainees = volTrainees.count ?? 0
  const nAus = ausencias.count ?? 0

  const [y, m] = mesRef.split("-").map(Number)
  const labelMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1)
  )

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/voluntarios"
        className="text-sm text-gh-accent hover:underline mb-4 inline-block"
      >
        ← Voluntários
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gh-text">Analítico</h1>
          <p className="text-gh-muted text-sm mt-1">
            Resumo de métricas do ministério
            {escalasMes.modo === "escalas_fallback" && (
              <span className="block text-gh-yellow mt-1 text-xs">
                Escalas do mês: contagem via tabela <code className="text-gh-text">escalas</code> (cultos/eventos
                indisponíveis ou com outro esquema).
              </span>
            )}
          </p>
        </div>
        <MesSelector mesAtual={mesRef} />
      </div>

      <p className="text-sm text-gh-muted mb-4 capitalize">Período: {labelMes}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card titulo="Voluntários (total)" valor={nVol} subtitulo="Todos os registos na tabela voluntarios." />
        <Card
          titulo="Em treinamento"
          valor={nTrainees}
          subtitulo="Voluntários com ao menos um papel em treinamento (campo treinamento)."
        />
        <Card
          titulo="Ausências registadas"
          valor={nAus}
          subtitulo="Linhas na tabela indisponibilidades (todas as datas)."
        />
        <Card
          titulo="Escalas no mês"
          valor={escalasMes.total}
          subtitulo="Soma de cultos e eventos com data no mês (ou escalas no mesmo intervalo, conforme a BD)."
        />
      </div>
    </div>
  )
}
