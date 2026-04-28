import { dataIsoDia } from "@/lib/mes"
import { gerarCultosDoMes } from "@/lib/scheduler/calendar"
import type { CultoGerado, Evento, MinisterioSlug, PapelSlug } from "@/lib/scheduler/types"

const PAPEIS_PADRAO: Record<MinisterioSlug, PapelSlug[]> = {
  tecnica: ["audio", "projecao", "iluminacao"],
  backstage: ["palco", "tecnica_bs"],
}

function chaveCulto(data: string, tipo: string, nome: string | null | undefined): string {
  const d = data.length >= 10 ? data.slice(0, 10) : data
  return `${d}|${tipo}|${nome ?? ""}`
}

/**
 * Garante uma coluna para cada culto do mês (domingos + eventos), mesmo sem linhas em `alocacoes`.
 * Antes, só apareciam cultos que tinham pelo menos uma alocação gravada — o último domingo podia sumir.
 */
export function cultosDoMesComAlocacoes(
  mes: string,
  ministerio: MinisterioSlug,
  eventos: Evento[],
  alocacoesRaw: Record<string, unknown>[],
): CultoGerado[] {
  const base = gerarCultosDoMes(mes, eventos).filter(c => c.ministerio === ministerio)
  const papeisEventoPorChave = new Map<string, PapelSlug[]>()
  for (const ev of eventos) {
    const key = chaveCulto(ev.data, "especial", ev.nome)
    const ps = Array.isArray(ev.papeis) && ev.papeis.length > 0 ? ev.papeis : PAPEIS_PADRAO[ministerio]
    papeisEventoPorChave.set(key, ps)
  }
  const porChave = new Map<string, CultoGerado>()
  for (const c of base) {
    porChave.set(chaveCulto(c.data, c.tipo, c.nome), { ...c, alocacoes: [] })
  }
  for (const r of alocacoesRaw) {
    const data = dataIsoDia(r.data)
    const tipo = String(r.tipo_culto ?? "")
    const nome = (r.nome_evento as string | null) ?? ""
    const key = chaveCulto(data, tipo, nome || undefined)
    let alvo = porChave.get(key)
    if (!alvo) {
      alvo = {
        data,
        tipo: tipo as CultoGerado["tipo"],
        nome: nome || undefined,
        ministerio,
        alocacoes: [],
      }
      porChave.set(key, alvo)
    }
    const linha = {
      voluntario_id: (r.voluntario_id as string | null) ?? "",
      papel: r.papel as PapelSlug,
      trainee: Boolean(r.trainee),
      fixada: Boolean(r.fixada),
      id: String(r.id ?? ""),
    }
    alvo.alocacoes.push(linha as CultoGerado["alocacoes"][number])
  }

  for (const [key, culto] of porChave) {
    const papeisEsperados =
      culto.tipo === "especial"
        ? (papeisEventoPorChave.get(key) ?? PAPEIS_PADRAO[ministerio])
        : PAPEIS_PADRAO[ministerio]
    for (const papel of papeisEsperados) {
      const temPrimario = culto.alocacoes.some(a => a.papel === papel && !a.trainee)
      if (temPrimario) continue
      culto.alocacoes.push({
        id: `novo|${key}|${papel}|prim`,
        voluntario_id: "",
        papel,
        trainee: false,
        fixada: false,
      } as CultoGerado["alocacoes"][number])
    }
    for (const papel of papeisEsperados) {
      const temTrainee = culto.alocacoes.some(a => a.papel === papel && a.trainee)
      if (temTrainee) continue
      culto.alocacoes.push({
        id: `novo|${key}|${papel}|train`,
        voluntario_id: "",
        papel,
        trainee: true,
        fixada: false,
      } as CultoGerado["alocacoes"][number])
    }
  }

  const keysBase = new Set(base.map(c => chaveCulto(c.data, c.tipo, c.nome)))
  const extra: CultoGerado[] = []
  for (const [k, c] of porChave) {
    if (!keysBase.has(k)) extra.push(c)
  }
  extra.sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data)
    if (a.tipo !== b.tipo) return String(a.tipo).localeCompare(String(b.tipo))
    return (a.nome ?? "").localeCompare(b.nome ?? "")
  })
  const principal = base.map(
    c => porChave.get(chaveCulto(c.data, c.tipo, c.nome)) ?? { ...c, alocacoes: [] },
  )
  return [...principal, ...extra]
}
