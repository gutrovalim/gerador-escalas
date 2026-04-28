import type {
  CultoGerado,
  Evento,
  MinisterioSlug,
  TipoCulto,
} from "./types"
import { MINISTERIOS_ORDEM_ALOCACAO } from "./types"

function parseMes(mes: string): [number, number] {
  const partes = mes.trim().split("-")
  if (partes.length !== 2) throw new Error(`Formato de mês inválido «${mes}»: use YYYY-MM.`)
  const ano = parseInt(partes[0], 10)
  const mesNum = parseInt(partes[1], 10)
  if (isNaN(ano) || isNaN(mesNum)) throw new Error(`Formato de mês inválido «${mes}»: ano e mês devem ser numéricos.`)
  if (mesNum < 1 || mesNum > 12) throw new Error(`Mês inválido em «${mes}»: o mês deve estar entre 01 e 12.`)
  return [ano, mesNum]
}

function domingosDomes(ano: number, mes: number): string[] {
  const domingos: string[] = []
  const diasNoMes = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mes - 1, d)
    if (dt.getDay() === 0) {
      domingos.push(
        `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      )
    }
  }
  return domingos
}

function tipoOrdem(tipo: TipoCulto): number {
  if (tipo === "dominical_manha") return 0
  if (tipo === "dominical_noite") return 1
  return 2
}

function ministerioOrdem(ministerio: MinisterioSlug): number {
  return MINISTERIOS_ORDEM_ALOCACAO.indexOf(ministerio)
}

export function gerarCultosDoMes(mes: string, eventosMes: Evento[]): CultoGerado[] {
  const [ano, mesNum] = parseMes(mes)
  const prefixo = `${String(ano).padStart(4, "0")}-${String(mesNum).padStart(2, "0")}`

  const resultado: CultoGerado[] = []

  for (const data of domingosDomes(ano, mesNum)) {
    for (const ministerio of MINISTERIOS_ORDEM_ALOCACAO) {
      resultado.push({ data, tipo: "dominical_manha", ministerio, alocacoes: [] })
      resultado.push({ data, tipo: "dominical_noite", ministerio, alocacoes: [] })
    }
  }

  for (const ev of eventosMes) {
    if (!ev.data.startsWith(prefixo)) continue
    for (const ministerio of ev.ministerios) {
      resultado.push({ data: ev.data, tipo: "especial", ministerio, nome: ev.nome, alocacoes: [] })
    }
  }

  resultado.sort((a, b) => {
    if (a.data < b.data) return -1
    if (a.data > b.data) return 1
    const t = tipoOrdem(a.tipo) - tipoOrdem(b.tipo)
    if (t !== 0) return t
    return ministerioOrdem(a.ministerio) - ministerioOrdem(b.ministerio)
  })

  return resultado
}
