import type { CultoGerado, MinisterioSlug, ModoEscala, PapelSlug } from "../scheduler/types"
import { intervaloHorarioEvento } from "../formato-br"

const LABELS_PAPEL: Record<PapelSlug, string> = {
  audio: "SOM",
  projecao: "PROJEÇÃO",
  iluminacao: "ILUMINAÇÃO",
  palco: "PALCO",
  tecnica_bs: "TÉCNICA",
}

function formatarData(dataIso: string): string {
  const partes = dataIso.split("-")
  return `${partes[2]}/${partes[1]}`
}

function papeisDaEscala(cultos: CultoGerado[], ministerio: MinisterioSlug): PapelSlug[] {
  const papeis = new Set<PapelSlug>()
  for (const c of cultos) {
    if (c.ministerio !== ministerio) continue
    for (const a of c.alocacoes) {
      papeis.add(a.papel)
    }
  }
  // ordem estável
  const ordem: PapelSlug[] = ["audio", "projecao", "iluminacao", "palco", "tecnica_bs"]
  return ordem.filter(p => papeis.has(p))
}

function nomePorId(nomesPorId: Map<string, string>, id: string): string {
  return nomesPorId.get(id) ?? id
}

function gerarSecaoDominical(
  cultos: CultoGerado[],
  ministerio: MinisterioSlug,
  tipo: "dominical_manha" | "dominical_noite",
  papeis: PapelSlug[],
  nomesPorId: Map<string, string>,
): string[][] {
  const cultosOrdenados = cultos
    .filter(c => c.ministerio === ministerio && c.tipo === tipo)
    .sort((a, b) => a.data.localeCompare(b.data))

  if (!cultosOrdenados.length) return []

  const titulo = tipo === "dominical_manha" ? "CULTO DA MANHÃ (10h)" : "CULTO DA NOITE (18h)"
  const datas = cultosOrdenados.map(c => formatarData(c.data))

  const linhas: string[][] = [
    ["", titulo, ...Array(datas.length - 1).fill("")],
    ["", ...datas],
  ]

  for (const papel of papeis) {
    const linhaPrim: string[] = [LABELS_PAPEL[papel]]
    const linhaTr: string[] = [""]

    for (const culto of cultosOrdenados) {
      const prims = culto.alocacoes.filter(a => a.papel === papel && !a.trainee)
      const trains = culto.alocacoes.filter(a => a.papel === papel && a.trainee)
      linhaPrim.push(
        prims.map(a => nomePorId(nomesPorId, a.voluntario_id)).join(" / ") || ""
      )
      linhaTr.push(
        trains.map(a => nomePorId(nomesPorId, a.voluntario_id)).join(" / ") || ""
      )
    }

    linhas.push(linhaPrim)
    linhas.push(linhaTr)
  }

  return linhas
}

function gerarSecaoEspeciais(
  cultos: CultoGerado[],
  ministerio: MinisterioSlug,
  papeis: PapelSlug[],
  nomesPorId: Map<string, string>,
): string[][] {
  const especiais = cultos
    .filter(c => c.ministerio === ministerio && c.tipo === "especial")
    .sort((a, b) => a.data.localeCompare(b.data) || (a.nome ?? "").localeCompare(b.nome ?? ""))

  if (!especiais.length) return []

  const cols = especiais.map(c => {
    const d = formatarData(c.data)
    const dow = new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" })
    const diaSem = dow.charAt(0).toUpperCase() + dow.slice(1, 3)
    const hrs = intervaloHorarioEvento(c.horario_inicio, c.horario_fim)
    const base = `${c.nome ?? "EVENTO"} ${d} ${diaSem}`
    return hrs ? `${base} ${hrs}` : base
  })

  const linhas: string[][] = [
    ["", "EVENTOS ESPECIAIS", ...Array(cols.length - 1).fill("")],
    ["", ...cols],
  ]

  for (const papel of papeis) {
    const linha: string[] = [LABELS_PAPEL[papel]]
    for (const culto of especiais) {
      const prims = culto.alocacoes.filter(a => a.papel === papel && !a.trainee)
      if (!prims.length) {
        // verifica se papel é exigido no evento (simplificação: usa "—" se outros papéis têm alocação)
        const temOutrosPapeis = culto.alocacoes.some(a => a.papel !== papel)
        linha.push(temOutrosPapeis ? "—" : "")
      } else {
        linha.push(prims.map(a => nomePorId(nomesPorId, a.voluntario_id)).join(" / "))
      }
    }
    linhas.push(linha)
  }

  return linhas
}

export function gerarCsv(
  cultos: CultoGerado[],
  ministerio: MinisterioSlug,
  modo: ModoEscala,
  nomesPorId: Map<string, string>,
): string {
  const papeis = papeisDaEscala(cultos, ministerio)
  const secoes: string[][] = []

  if (modo === "equipe_unica") {
    const manha = gerarSecaoDominical(cultos, ministerio, "dominical_manha", papeis, nomesPorId)
    if (manha.length) {
      // adiciona nota de replicação na linha de título
      if (manha[0][1]) manha[0][1] += " — mesma equipe no culto da noite"
      secoes.push(...manha)
    }
  } else {
    const manha = gerarSecaoDominical(cultos, ministerio, "dominical_manha", papeis, nomesPorId)
    const noite = gerarSecaoDominical(cultos, ministerio, "dominical_noite", papeis, nomesPorId)
    if (manha.length) secoes.push(...manha)
    if (secoes.length && noite.length) secoes.push([""])
    if (noite.length) secoes.push(...noite)
  }

  const especiais = gerarSecaoEspeciais(cultos, ministerio, papeis, nomesPorId)
  if (especiais.length) {
    secoes.push([""])
    secoes.push(...especiais)
  }

  return secoes
    .map(linha => linha.map(cel => (cel.includes(",") || cel.includes('"') ? `"${cel.replace(/"/g, '""')}"` : cel)).join(","))
    .join("\n")
}
