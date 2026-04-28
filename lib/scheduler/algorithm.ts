import type {
  Alocacao,
  AlocacaoFixa,
  ConfigMinisterio,
  CultoGerado,
  Evento,
  Ausencia,
  MinisterioSlug,
  ModoEscala,
  Par,
  PapelSlug,
  RestricaoTipo,
  TipoCulto,
  Voluntario,
} from "./types"
import { MINISTERIOS_ORDEM_ALOCACAO, PAPEIS_BACKSTAGE, PAPEIS_TECNICA } from "./types"

// ─── Utilitários de mapa com default ─────────────────────────────────────────

function getN(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0
}

function setN(map: Map<string, number>, key: string, val: number): void {
  map.set(key, val)
}

function incN(map: Map<string, number>, key: string, delta = 1): void {
  map.set(key, (map.get(key) ?? 0) + delta)
}

function decN(map: Map<string, number>, key: string): void {
  map.set(key, Math.max(0, (map.get(key) ?? 0) - 1))
}

function getOrCreateSet(map: Map<string, Set<string>>, key: string): Set<string> {
  let s = map.get(key)
  if (!s) { s = new Set(); map.set(key, s) }
  return s
}

function getOrCreateSetOfStr(map: Map<string, Set<string>>, key: string): Set<string> {
  return getOrCreateSet(map, key)
}

// ─── Chaves compostas ─────────────────────────────────────────────────────────

function kPapel(id: string, papel: PapelSlug): string { return `${id}|${papel}` }
function kBloqueio(id: string, data: string): string { return `${id}|${data}` }
function kRn17(data: string, tipo: TipoCulto): string { return `${data}|${tipo}` }

// ─── Estado interno ──────────────────────────────────────────────────────────

interface Estado {
  bloqueios: Set<string>
  ausencias: Ausencia[]
  contagemAtiva: Map<string, number>
  contagem30d: Map<string, number>
  participacaoMes: Map<string, number>
  traineeMes: Map<string, number>
  traineePorPapel: Map<string, number>
  traineeUltimaData: Map<string, string | null>
  alertas: string[]
  preferencialRn17: Map<string, Set<string>>
}

function criarEstado(bloqueios: Set<string>, ausencias: Ausencia[]): Estado {
  return {
    bloqueios,
    ausencias,
    contagemAtiva: new Map(),
    contagem30d: new Map(),
    participacaoMes: new Map(),
    traineeMes: new Map(),
    traineePorPapel: new Map(),
    traineeUltimaData: new Map(),
    alertas: [],
    preferencialRn17: new Map(),
  }
}

// ─── RN-04: bloqueio de disponibilidade ──────────────────────────────────────

function bloqueado(
  est: Estado,
  volId: string,
  data: string,
  tipo?: TipoCulto,
  _ev?: Evento | null,
): boolean {
  if (tipo === undefined) {
    return est.bloqueios.has(kBloqueio(volId, data))
  }
  for (const ind of est.ausencias) {
    if (ind.voluntario_id !== volId || ind.data !== data) continue
    const escopo = ind.escopo ?? "ambos"
    if (tipo === "especial") {
      if (escopo === "cultos") continue
      return true
    }
    if (escopo === "eventos") continue
    const turnos = ind.turnos.length === 0 ? ["manha", "noite"] : ind.turnos
    if (tipo === "dominical_manha" && turnos.includes("manha")) return true
    if (tipo === "dominical_noite" && turnos.includes("noite")) return true
  }
  return false
}

function calcBloqueios(ind: Ausencia[]): Set<string> {
  const out = new Set<string>()
  for (const x of ind) {
    const escopo = x.escopo ?? "ambos"
    if (escopo === "eventos") continue
    const turnos = x.turnos.length === 0 ? ["manha", "noite"] : x.turnos
    if (turnos.includes("manha") && turnos.includes("noite")) {
      out.add(kBloqueio(x.voluntario_id, x.data))
    }
  }
  return out
}

// ─── Helpers de domínio ───────────────────────────────────────────────────────

function antesdeMeiodia(horarioInicio: string): boolean {
  const partes = horarioInicio.trim().split(":")
  const h = parseInt(partes[0], 10)
  const m = partes.length > 1 ? parseInt(partes[1], 10) : 0
  return h * 60 + m < 12 * 60
}

function papeisPadrao(m: MinisterioSlug): PapelSlug[] {
  if (m === "tecnica") return ["audio", "projecao", "iluminacao"]
  return ["palco", "tecnica_bs"]
}

function eventoEspecial(eventosMes: Evento[], culto: CultoGerado): Evento | null {
  if (culto.tipo !== "especial" || !culto.nome) return null
  return eventosMes.find(ev => ev.data === culto.data && ev.nome === culto.nome) ?? null
}

function papeisExigidos(culto: CultoGerado, evento: Evento | null): PapelSlug[] {
  if (culto.tipo !== "especial") return papeisPadrao(culto.ministerio)
  if (!evento) return papeisPadrao(culto.ministerio)
  const permitidos = culto.ministerio === "tecnica" ? PAPEIS_TECNICA : PAPEIS_BACKSTAGE
  if (evento.papeis && evento.papeis.length > 0) {
    return evento.papeis.filter(p => permitidos.has(p))
  }
  return papeisPadrao(culto.ministerio)
}

function apenasManual(v: Voluntario): boolean {
  return v.restricoes.includes("apenas_manual")
}

function elegivelAuto(v: Voluntario): boolean {
  return v.ativo && !apenasManual(v)
}

function volPorId(voluntarios: Voluntario[]): Map<string, Voluntario> {
  return new Map(voluntarios.map(v => [v.id, v]))
}

function mapaPares(pares: [string, string][]): Map<string, string> {
  const m = new Map<string, string>()
  for (const [a, b] of pares) {
    m.set(a, b)
    m.set(b, a)
  }
  return m
}

function paresBackstageTuplas(pares: Par[]): [string, string][] {
  return pares
    .filter(p => p.tipo === "par" && p.ministerio === "backstage")
    .map(p => [p.membro_1, p.membro_2] as [string, string])
}

function paresTecnicaAudioProjecao(
  pares: Par[],
  porId: Map<string, Voluntario>,
): [string, string][] {
  const out: [string, string][] = []
  for (const par of pares) {
    if (par.tipo !== "par" || par.ministerio !== "tecnica") continue
    const va = porId.get(par.membro_1)
    const vb = porId.get(par.membro_2)
    if (!va || !vb) continue
    const aAud = va.papeis.includes("audio")
    const aPrj = va.papeis.includes("projecao")
    const bAud = vb.papeis.includes("audio")
    const bPrj = vb.papeis.includes("projecao")
    if (aAud && bPrj && !aPrj && !bAud) {
      out.push([par.membro_1, par.membro_2])
    } else if (bAud && aPrj && !bPrj && !aAud) {
      out.push([par.membro_2, par.membro_1])
    }
  }
  return out
}

// ─── RN-06: restrições de período ─────────────────────────────────────────────

function slotEhManha(culto: CultoGerado, ev: Evento | null): boolean {
  if (culto.tipo === "dominical_manha") return true
  if (culto.tipo === "dominical_noite") return false
  if (culto.tipo === "especial") {
    if (!ev) return true
    return antesdeMeiodia(ev.horario_inicio)
  }
  return true
}

function prioridadeRn06Empate(culto: CultoGerado, ev: Evento | null, v: Voluntario): number {
  const sm = v.restricoes.includes("somente_manha")
  const sn = v.restricoes.includes("somente_noite")
  if (slotEhManha(culto, ev)) return sm ? 0 : 1
  return sn ? 0 : 1
}

function rn06ok(v: Voluntario, culto: CultoGerado, ev: Evento | null): boolean {
  const sm = v.restricoes.includes("somente_manha")
  const sn = v.restricoes.includes("somente_noite")
  if (sm && sn) return false
  if (!sm && !sn) return true
  if (culto.tipo === "dominical_manha") return sm
  if (culto.tipo === "dominical_noite") return sn
  if (culto.tipo === "especial" && ev) {
    const antes = antesdeMeiodia(ev.horario_inicio)
    return sm ? antes : !antes
  }
  return false
}

// ─── RN-17: preferências cross-ministério ────────────────────────────────────

function preferenciaRn17(est: Estado, v: Voluntario, culto: CultoGerado): number {
  const chave = kRn17(culto.data, culto.tipo)
  const prefs = est.preferencialRn17.get(v.id)
  if (prefs?.has(chave)) return 0
  return 1
}

function rn17RegistrarParceiro(
  est: Estado,
  mapaCross: Map<string, string>,
  volIdAlocado: string,
  data: string,
): void {
  const par = mapaCross.get(volIdAlocado)
  if (!par) return
  const s = getOrCreateSetOfStr(est.preferencialRn17, par)
  s.add(kRn17(data, "dominical_manha"))
  s.add(kRn17(data, "dominical_noite"))
}

// ─── Chave de seleção (RN-05, RN-06, RN-17) ──────────────────────────────────

type ChaveSelecao = [number, number, number, number, number, string]

function chaveSelecao(
  est: Estado,
  v: Voluntario,
  papel: PapelSlug,
  culto: CultoGerado,
  ev: Evento | null,
): ChaveSelecao {
  return [
    getN(est.participacaoMes, v.id),
    prioridadeRn06Empate(culto, ev, v),
    preferenciaRn17(est, v, culto),
    getN(est.contagemAtiva, kPapel(v.id, papel)),
    getN(est.contagem30d, kPapel(v.id, papel)),
    v.nome,
  ]
}

function compareTuples(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return a.length - b.length
}

function ordenarCandidatos(
  candidatos: Voluntario[],
  papel: PapelSlug,
  est: Estado,
  culto: CultoGerado,
  ev: Evento | null,
): Voluntario[] {
  return [...candidatos].sort((a, b) =>
    compareTuples(chaveSelecao(est, a, papel, culto, ev), chaveSelecao(est, b, papel, culto, ev))
  )
}

function escolher(
  candidatos: Voluntario[],
  papel: PapelSlug,
  est: Estado,
  culto: CultoGerado,
  ev: Evento | null,
): Voluntario | null {
  if (!candidatos.length) return null
  return ordenarCandidatos(candidatos, papel, est, culto, ev)[0]
}

// ─── Mutação de estado ────────────────────────────────────────────────────────

function incrementarParticipacao(est: Estado, volId: string, papel: PapelSlug): void {
  incN(est.contagemAtiva, kPapel(volId, papel))
  incN(est.participacaoMes, volId)
}

function decrementarParticipacao(est: Estado, volId: string, papel: PapelSlug): void {
  decN(est.contagemAtiva, kPapel(volId, papel))
  decN(est.participacaoMes, volId)
}

function reverterTraineeSlot(est: Estado, volId: string, papel: PapelSlug): void {
  const kT = kPapel(volId, papel)
  setN(est.traineePorPapel, kT, Math.max(0, getN(est.traineePorPapel, kT) - 1))
  setN(est.traineeMes, volId, Math.max(0, getN(est.traineeMes, volId) - 1))
}

function registrarTrainee(est: Estado, volId: string, papel: PapelSlug, data: string): void {
  incN(est.traineeMes, volId)
  incN(est.traineePorPapel, kPapel(volId, papel))
  est.traineeUltimaData.set(volId, data)
}

// ─── RN-11: trainees ──────────────────────────────────────────────────────────

function cohorteTrainesDoPapel(
  voluntarios: Voluntario[],
  papel: PapelSlug,
  ministerio: MinisterioSlug,
): Voluntario[] {
  return voluntarios.filter(
    v => v.ativo && !apenasManual(v) && v.ministerio === ministerio && v.treinamento.includes(papel)
  )
}

function podeTraineeRn11(
  est: Estado,
  v: Voluntario,
  voluntarios: Voluntario[],
  papel: PapelSlug,
  culto: CultoGerado,
): boolean {
  if (getN(est.traineeMes, v.id) >= 2) return false
  const k = getN(est.traineePorPapel, kPapel(v.id, papel))
  if (k >= 2) return false
  if (k === 0) return true
  const cohorte = cohorteTrainesDoPapel(voluntarios, papel, culto.ministerio)
  if (!cohorte.length) return true
  return cohorte.every(w => getN(est.traineePorPapel, kPapel(w.id, papel)) >= 1)
}

function traineeEspacamentoOk(
  est: Estado,
  volId: string,
  data: string,
  datasOrdenadas: string[],
): boolean {
  const ult = est.traineeUltimaData.get(volId) ?? null
  if (!ult) return true
  const iUlt = datasOrdenadas.indexOf(ult)
  const iAt = datasOrdenadas.indexOf(data)
  if (iUlt === -1 || iAt === -1) return true
  return iAt > iUlt + 1
}

function permiteTraineeIgnorarEspacamento(datasOrd: string[]): boolean {
  return datasOrd.length <= 2
}

// ─── Elegibilidade ────────────────────────────────────────────────────────────

function primarioOk(
  v: Voluntario,
  papel: PapelSlug,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
  exigirAuto: boolean,
): boolean {
  if (v.ministerio !== culto.ministerio) return false
  if (exigirAuto && !elegivelAuto(v)) return false
  if (!exigirAuto && !v.ativo) return false
  if (!v.papeis.includes(papel)) return false
  if (bloqueado(est, v.id, data, culto.tipo, ev)) return false
  return rn06ok(v, culto, ev)
}

function traineeOk(
  v: Voluntario,
  papel: PapelSlug,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
): boolean {
  if (culto.tipo === "especial") return false
  if (!elegivelAuto(v)) return false
  if (v.ministerio !== culto.ministerio) return false
  if (!v.treinamento.includes(papel)) return false
  if (bloqueado(est, v.id, data, culto.tipo, ev)) return false
  return rn06ok(v, culto, ev)
}

// ─── Alocações fixas (RN-07) ──────────────────────────────────────────────────

function aplicarFixas(
  evento: Evento | null,
  culto: CultoGerado,
  papeis: PapelSlug[],
  voluntarios: Voluntario[],
  est: Estado,
  fixasDominical?: AlocacaoFixa[],
): Map<PapelSlug, [Alocacao, null]> {
  const out = new Map<PapelSlug, [Alocacao, null]>()
  const lista: AlocacaoFixa[] = [
    ...(evento?.alocacoes_fixas ?? []),
    ...(fixasDominical ?? []),
  ]
  if (!lista.length) return out
  const porId = volPorId(voluntarios)
  for (const fixa of lista) {
    if (!papeis.includes(fixa.papel)) continue
    const v = porId.get(fixa.voluntario_id)
    if (!v || v.ministerio !== culto.ministerio) continue
    out.set(fixa.papel, [
      { voluntario_id: fixa.voluntario_id, papel: fixa.papel, trainee: false, fixada: true },
      null,
    ])
    if (!apenasManual(v)) incrementarParticipacao(est, fixa.voluntario_id, fixa.papel)
  }
  return out
}

/** Chave alinhada com `alocacoes_fixas_culto` / API: data|tipo_culto|ministerio */
function fixasDominicalDoMapa(
  mapa: Map<string, AlocacaoFixa[]> | undefined,
  culto: CultoGerado,
): AlocacaoFixa[] | undefined {
  if (!mapa?.size) return undefined
  if (culto.tipo !== "dominical_manha" && culto.tipo !== "dominical_noite") return undefined
  const k = `${culto.data}|${culto.tipo}|${culto.ministerio}`
  const arr = mapa.get(k)
  return arr?.length ? arr : undefined
}

function montarListaPorPapel(
  papeis: PapelSlug[],
  porPapel: Map<PapelSlug, [Alocacao | null, Alocacao | null]>,
): Alocacao[] {
  const lista: Alocacao[] = []
  for (const papel of papeis) {
    const par = porPapel.get(papel)
    if (!par) continue
    const [prim, tr] = par
    if (prim) lista.push(prim)
    if (tr) lista.push(tr)
  }
  return lista
}

// ─── Trainee Técnica ──────────────────────────────────────────────────────────

function alocarTraineeTecnicaComPrimario(
  voluntarios: Voluntario[],
  papel: PapelSlug,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
  nomePrimarioId: string,
  datasOrd: string[],
  excluir: Set<string> | null,
): Alocacao | null {
  let candsT = voluntarios.filter(
    v =>
      traineeOk(v, papel, culto, data, ev, est) &&
      v.id !== nomePrimarioId &&
      podeTraineeRn11(est, v, voluntarios, papel, culto) &&
      traineeEspacamentoOk(est, v.id, data, datasOrd)
  )
  if (excluir) candsT = candsT.filter(v => !excluir.has(v.id))
  if (!candsT.length && permiteTraineeIgnorarEspacamento(datasOrd)) {
    candsT = voluntarios.filter(
      v =>
        traineeOk(v, papel, culto, data, ev, est) &&
        v.id !== nomePrimarioId &&
        podeTraineeRn11(est, v, voluntarios, papel, culto)
    )
  }
  const t = escolher(candsT, papel, est, culto, ev)
  if (!t) return null
  const train: Alocacao = { voluntario_id: t.id, papel, trainee: true, fixada: false }
  registrarTrainee(est, t.id, papel, data)
  return train
}

// ─── Papel individual Técnica ─────────────────────────────────────────────────

function alocarUmPapelTecnica(
  voluntarios: Voluntario[],
  papel: PapelSlug,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
  excluir: Set<string> | null,
  datasOrd: string[],
): [Alocacao | null, Alocacao | null] {
  let cands = voluntarios.filter(
    v =>
      primarioOk(v, papel, culto, data, ev, est, true) &&
      (!excluir || !excluir.has(v.id))
  )
  let p = escolher(cands, papel, est, culto, ev)
  if (!p) {
    cands = voluntarios.filter(v => primarioOk(v, papel, culto, data, ev, est, true))
    p = escolher(cands, papel, est, culto, ev)
  }
  if (!p) return [null, null]
  const prim: Alocacao = { voluntario_id: p.id, papel, trainee: false, fixada: false }
  incrementarParticipacao(est, p.id, papel)
  const tr = alocarTraineeTecnicaComPrimario(
    voluntarios,
    papel,
    culto,
    data,
    ev,
    est,
    p.id,
    datasOrd,
    excluir,
  )
  return [prim, tr]
}

// ─── RN-13 Técnica: áudio + projeção no mesmo culto ──────────────────────────

function alocacoesCandidatoAudioProjTecnica(
  v: Voluntario,
  usados: Set<string>,
  openA: boolean,
  openP: boolean,
  mapaPar: Map<string, string>,
  porId: Map<string, Voluntario>,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
): [Voluntario, PapelSlug][] | null {
  if (usados.has(v.id)) return null
  const partnerNome = mapaPar.get(v.id)
  const pw = partnerNome ? porId.get(partnerNome) : undefined
  const partnerLivre = !!(partnerNome && !usados.has(partnerNome) && pw)

  if (partnerLivre && openA && openP && pw) {
    if (
      v.papeis.includes("audio") &&
      pw.papeis.includes("projecao") &&
      primarioOk(v, "audio", culto, data, ev, est, true) &&
      primarioOk(pw, "projecao", culto, data, ev, est, true)
    ) {
      return [[v, "audio"], [pw, "projecao"]]
    }
    if (
      v.papeis.includes("projecao") &&
      pw.papeis.includes("audio") &&
      primarioOk(v, "projecao", culto, data, ev, est, true) &&
      primarioOk(pw, "audio", culto, data, ev, est, true)
    ) {
      return [[v, "projecao"], [pw, "audio"]]
    }
  }

  const opts: [Voluntario, PapelSlug][] = []
  if (openA && v.papeis.includes("audio") && primarioOk(v, "audio", culto, data, ev, est, true)) {
    opts.push([v, "audio"])
  }
  if (openP && v.papeis.includes("projecao") && primarioOk(v, "projecao", culto, data, ev, est, true)) {
    opts.push([v, "projecao"])
  }
  if (!opts.length) return null
  if (opts.length === 1) return [opts[0]]
  opts.sort(([v1, p1], [v2, p2]) =>
    compareTuples(chaveSelecao(est, v1, p1, culto, ev), chaveSelecao(est, v2, p2, culto, ev))
  )
  return [opts[0]]
}

function preencherAudioProjecaoTecnicaDominical(
  culto: CultoGerado,
  data: string,
  voluntarios: Voluntario[],
  est: Estado,
  porPapel: Map<PapelSlug, [Alocacao | null, Alocacao | null]>,
  paresAudioProj: [string, string][],
  porId: Map<string, Voluntario>,
  usadosIniciais?: Set<string>,
): void {
  if (!paresAudioProj.length) return
  const mapaPar = mapaPares(paresAudioProj)
  const usados = new Set<string>(usadosIniciais ?? [])
  const ev: Evento | null = null

  function livre(p: PapelSlug): boolean {
    const t = porPapel.get(p)
    return !t || !t[0]
  }

  while (livre("audio") || livre("projecao")) {
    const oa = livre("audio")
    const op = livre("projecao")
    const cands = voluntarios.filter(v =>
      !!alocacoesCandidatoAudioProjTecnica(v, usados, oa, op, mapaPar, porId, culto, data, ev, est)
    )
    if (!cands.length) break

    cands.sort((vv1, vv2) => {
      function chaveSort(vv: Voluntario): (number | string)[] {
        const alS = alocacoesCandidatoAudioProjTecnica(vv, usados, oa, op, mapaPar, porId, culto, data, ev, est)
        if (!alS) return [1e9, 1, 1e9, 1e9, 1e9, 1e9, "\uffff"]
        const [v0, p0] = alS[0]
        const ch = chaveSelecao(est, v0, p0, culto, ev)
        const penalProjSozinho =
          oa && op && alS.length < 2 && alS[0][1] === "projecao" ? 8 : 0
        const fechaPar = oa && op && alS.length >= 2 ? 0 : 1
        return [ch[0] + penalProjSozinho, fechaPar, ...ch.slice(1)]
      }
      return compareTuples(chaveSort(vv1), chaveSort(vv2))
    })

    const escolhido = cands[0]
    const alocsFinais = alocacoesCandidatoAudioProjTecnica(
      escolhido, usados, oa, op, mapaPar, porId, culto, data, ev, est
    )!
    for (const [vol, papel] of alocsFinais) {
      const prim: Alocacao = { voluntario_id: vol.id, papel, trainee: false, fixada: false }
      incrementarParticipacao(est, vol.id, papel)
      porPapel.set(papel, [prim, null])
      usados.add(vol.id)
    }
  }
}

function rn13CompletarParceirtoAudioProjecao(
  voluntarios: Voluntario[],
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
  porId: Map<string, Voluntario>,
  paresAudioProj: [string, string][],
  porPapel: Map<PapelSlug, [Alocacao | null, Alocacao | null]>,
  excluirDia: Set<string> | null,
): void {
  if (!paresAudioProj.length) return
  const mapaPar = mapaPares(paresAudioProj)
  const pares: [PapelSlug, PapelSlug][] = [["audio", "projecao"], ["projecao", "audio"]]
  for (const [papelOcupado, papelVazio] of pares) {
    const parOc = porPapel.get(papelOcupado)
    if (!parOc || !parOc[0]) continue
    const parVa = porPapel.get(papelVazio)
    if (parVa && parVa[0]) continue
    const nomePrim = parOc[0].voluntario_id
    const parceiroId = mapaPar.get(nomePrim)
    if (!parceiroId) continue
    if (excluirDia?.has(parceiroId)) continue
    const pw = porId.get(parceiroId)
    if (!pw || !pw.papeis.includes(papelVazio)) continue
    if (!primarioOk(pw, papelVazio, culto, data, ev, est, true)) continue
    const al: Alocacao = { voluntario_id: parceiroId, papel: papelVazio, trainee: false, fixada: false }
    incrementarParticipacao(est, parceiroId, papelVazio)
    porPapel.set(papelVazio, [al, null])
  }
}

function alocarCultoGenericoTecnica(
  voluntarios: Voluntario[],
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  papeis: PapelSlug[],
  est: Estado,
  datasOrd: string[],
  porId: Map<string, Voluntario>,
  paresAudioProj: [string, string][],
  usadosNoDia?: Set<string>,
  mapaFixasCulto?: Map<string, AlocacaoFixa[]>,
): Alocacao[] {
  const excluirDia = usadosNoDia ? new Set(usadosNoDia) : null
  const fixas = aplicarFixas(ev, culto, papeis, voluntarios, est, fixasDominicalDoMapa(mapaFixasCulto, culto))
  const porPapel = new Map<PapelSlug, [Alocacao | null, Alocacao | null]>(
    [...fixas.entries()].map(([p, v]) => [p, v])
  )

  if (
    (culto.tipo === "dominical_manha" || culto.tipo === "dominical_noite") &&
    !ev &&
    papeis.includes("audio") &&
    papeis.includes("projecao") &&
    paresAudioProj.length
  ) {
    preencherAudioProjecaoTecnicaDominical(
      culto,
      data,
      voluntarios,
      est,
      porPapel,
      paresAudioProj,
      porId,
      excluirDia ?? undefined,
    )
  }

  for (const papel of papeis) {
    const existente = porPapel.get(papel)
    if (existente && existente[0]) continue
    const [prim, tr] = alocarUmPapelTecnica(
      voluntarios, papel, culto, data, ev, est, excluirDia, datasOrd
    )
    porPapel.set(papel, [prim, tr])
    if (prim && paresAudioProj.length) {
      rn13CompletarParceirtoAudioProjecao(
        voluntarios, culto, data, ev, est, porId, paresAudioProj, porPapel, excluirDia
      )
    }
  }

  // segunda passagem para trainees sem primário alocado na primeira passagem
  for (const papel of papeis) {
    const par = porPapel.get(papel)
    if (!par) continue
    const [prim, tr] = par
    if (!prim || tr) continue
    const trNovo = alocarTraineeTecnicaComPrimario(
      voluntarios, papel, culto, data, ev, est, prim.voluntario_id, datasOrd, excluirDia
    )
    if (trNovo) porPapel.set(papel, [prim, trNovo])
  }

  return montarListaPorPapel(papeis, porPapel)
}

// ─── RN-13 Backstage ──────────────────────────────────────────────────────────

function primarioBackstageParceiroRn13Ok(
  v: Voluntario,
  papelAlvo: PapelSlug,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
  est: Estado,
  porM: Map<PapelSlug, [Alocacao | null, Alocacao | null]>,
  mapaPar: Map<string, string>,
  porId: Map<string, Voluntario>,
): boolean {
  if (papelAlvo !== "palco" && papelAlvo !== "tecnica_bs") return true
  const wId = mapaPar.get(v.id)
  if (!wId) return true
  const w = porId.get(wId)
  if (!w) return true
  const pOutro: PapelSlug = papelAlvo === "palco" ? "tecnica_bs" : "palco"
  const parOut = porM.get(pOutro)
  const primOut = parOut?.[0] ?? null
  if (!primOut) return true
  if (primOut.voluntario_id === wId) return true
  if (bloqueado(est, wId, data, culto.tipo, ev)) return true
  if (getN(est.participacaoMes, wId) >= 3) return true
  if (!primarioOk(w, pOutro, culto, data, ev, est, true)) return true
  return false
}

function chavePoolRn05Union(
  est: Estado,
  v: Voluntario,
  mapaPar: Map<string, string>,
  abertos: PapelSlug[],
  usadosNoDia: Set<string>,
  porId: Map<string, Voluntario>,
  culto: CultoGerado,
  data: string,
  ev: Evento | null,
): [number, number, number, number, number, string] {
  const pm = getN(est.participacaoMes, v.id)
  const pr06 = prioridadeRn06Empate(culto, ev, v)
  const pr17 = preferenciaRn17(est, v, culto)
  let prefDupla = 1
  if (abertos.length === 2) {
    const wId = mapaPar.get(v.id)
    if (wId && !usadosNoDia.has(wId)) {
      const pw = porId.get(wId)
      if (pw && (
        (primarioOk(v, "palco", culto, data, ev, est, true) && primarioOk(pw, "tecnica_bs", culto, data, ev, est, true)) ||
        (primarioOk(v, "tecnica_bs", culto, data, ev, est, true) && primarioOk(pw, "palco", culto, data, ev, est, true))
      )) {
        prefDupla = 0
      }
    }
  }
  let split = 0
  if (abertos.length === 1) {
    const papelU = abertos[0]
    const pId = mapaPar.get(v.id)
    if (pId && !usadosNoDia.has(pId)) {
      const pw = porId.get(pId)
      if (pw && primarioOk(pw, papelU, culto, data, ev, est, true)) split = 1
    }
  }
  return [pm, pr06, pr17, prefDupla, split, v.nome]
}

function preencherPrimariosBackstageDominical(
  culto: CultoGerado,
  data: string,
  voluntarios: Voluntario[],
  est: Estado,
  usadosNoDia: Set<string>,
  pares: [string, string][],
  porId: Map<string, Voluntario>,
  porM: Map<PapelSlug, [Alocacao | null, Alocacao | null]>,
): void {
  const ev: Evento | null = null
  const mapaPar = mapaPares(pares)

  function primarioLivre(p: PapelSlug): boolean {
    const par = porM.get(p)
    return !par || !par[0]
  }

  while (primarioLivre("palco") || primarioLivre("tecnica_bs")) {
    const abertos: PapelSlug[] = (["palco", "tecnica_bs"] as PapelSlug[]).filter(primarioLivre)
    const candsUnion = voluntarios.filter(
      v =>
        !usadosNoDia.has(v.id) &&
        abertos.some(p => primarioOk(v, p, culto, data, ev, est, true)) &&
        abertos
          .filter(p => primarioOk(v, p, culto, data, ev, est, true))
          .every(p =>
            primarioBackstageParceiroRn13Ok(v, p, culto, data, ev, est, porM, mapaPar, porId)
          )
    )
    if (!candsUnion.length) break

    candsUnion.sort((a, b) =>
      compareTuples(
        chavePoolRn05Union(est, a, mapaPar, abertos, usadosNoDia, porId, culto, data, ev),
        chavePoolRn05Union(est, b, mapaPar, abertos, usadosNoDia, porId, culto, data, ev),
      )
    )

    const v = candsUnion[0]
    const partnerNome = mapaPar.get(v.id)
    const w = partnerNome ? porId.get(partnerNome) : undefined

    let fezDupla = false
    if (abertos.length === 2 && w && !usadosNoDia.has(w.id)) {
      if (
        primarioOk(v, "palco", culto, data, ev, est, true) &&
        primarioOk(w, "tecnica_bs", culto, data, ev, est, true)
      ) {
        const alP: Alocacao = { voluntario_id: v.id, papel: "palco", trainee: false, fixada: false }
        const alT: Alocacao = { voluntario_id: w.id, papel: "tecnica_bs", trainee: false, fixada: false }
        incrementarParticipacao(est, v.id, "palco")
        incrementarParticipacao(est, w.id, "tecnica_bs")
        porM.set("palco", [alP, null])
        porM.set("tecnica_bs", [alT, null])
        usadosNoDia.add(v.id)
        usadosNoDia.add(w.id)
        fezDupla = true
      } else if (
        primarioOk(v, "tecnica_bs", culto, data, ev, est, true) &&
        primarioOk(w, "palco", culto, data, ev, est, true)
      ) {
        const alP: Alocacao = { voluntario_id: w.id, papel: "palco", trainee: false, fixada: false }
        const alT: Alocacao = { voluntario_id: v.id, papel: "tecnica_bs", trainee: false, fixada: false }
        incrementarParticipacao(est, w.id, "palco")
        incrementarParticipacao(est, v.id, "tecnica_bs")
        porM.set("palco", [alP, null])
        porM.set("tecnica_bs", [alT, null])
        usadosNoDia.add(v.id)
        usadosNoDia.add(w.id)
        fezDupla = true
      }
    }

    if (fezDupla) continue

    let alocouIndividual = false
    for (const p of ["palco", "tecnica_bs"] as PapelSlug[]) {
      if (!primarioLivre(p)) continue
      if (!primarioOk(v, p, culto, data, ev, est, true)) continue
      if (!primarioBackstageParceiroRn13Ok(v, p, culto, data, ev, est, porM, mapaPar, porId)) continue
      const al: Alocacao = { voluntario_id: v.id, papel: p, trainee: false, fixada: false }
      incrementarParticipacao(est, v.id, p)
      porM.set(p, [al, null])
      usadosNoDia.add(v.id)
      alocouIndividual = true
      break
    }
    if (!alocouIndividual) break
  }
}

function alocarBackstageCulto(
  culto: CultoGerado,
  ev: Evento | null,
  papeis: PapelSlug[],
  voluntarios: Voluntario[],
  est: Estado,
  usadosNoDia: Set<string>,
  pares: [string, string][],
  porId: Map<string, Voluntario>,
  datasOrd: string[],
  mapaFixasCulto?: Map<string, AlocacaoFixa[]>,
): Alocacao[] {
  const data = culto.data

  const fixas = aplicarFixas(ev, culto, papeis, voluntarios, est, fixasDominicalDoMapa(mapaFixasCulto, culto))
  const porM = new Map<PapelSlug, [Alocacao | null, Alocacao | null]>(
    [...fixas.entries()].map(([p, v]) => [p, v])
  )
  const pendentes = papeis.filter(p => !porM.has(p))

  if (
    culto.tipo !== "especial" &&
    pendentes.length === 2 &&
    pendentes.includes("palco") &&
    pendentes.includes("tecnica_bs")
  ) {
    preencherPrimariosBackstageDominical(culto, data, voluntarios, est, usadosNoDia, pares, porId, porM)
  }

  const mapaParBs = mapaPares(pares)
  for (const papel of papeis) {
    const existente = porM.get(papel)
    if (existente?.[0]) continue
    const excl = new Set(usadosNoDia)
    let cands = voluntarios.filter(
      v =>
        primarioOk(v, papel, culto, data, ev, est, true) &&
        !excl.has(v.id) &&
        primarioBackstageParceiroRn13Ok(v, papel, culto, data, ev, est, porM, mapaParBs, porId)
    )
    let esc = escolher(cands, papel, est, culto, ev)
    if (!esc) {
      cands = voluntarios.filter(
        v =>
          primarioOk(v, papel, culto, data, ev, est, true) &&
          primarioBackstageParceiroRn13Ok(v, papel, culto, data, ev, est, porM, mapaParBs, porId)
      )
      esc = escolher(cands, papel, est, culto, ev)
    }
    if (!esc) {
      est.alertas.push(`Backstage ${data} (${culto.tipo}): sem voluntário para «${papel}».`)
      porM.set(papel, [null, null])
      continue
    }
    const prim: Alocacao = { voluntario_id: esc.id, papel, trainee: false, fixada: false }
    incrementarParticipacao(est, esc.id, papel)
    usadosNoDia.add(esc.id)
    porM.set(papel, [prim, null])
  }

  // trainees backstage
  if (culto.tipo !== "especial") {
    for (const papel of papeis) {
      const par = porM.get(papel)
      if (!par || !par[0] || par[1]) continue
      const prim = par[0]
      let candsT = voluntarios.filter(
        v =>
          traineeOk(v, papel, culto, data, ev, est) &&
          v.id !== prim.voluntario_id &&
          podeTraineeRn11(est, v, voluntarios, papel, culto) &&
          !usadosNoDia.has(v.id) &&
          traineeEspacamentoOk(est, v.id, data, datasOrd)
      )
      if (!candsT.length && permiteTraineeIgnorarEspacamento(datasOrd)) {
        candsT = voluntarios.filter(
          v =>
            traineeOk(v, papel, culto, data, ev, est) &&
            v.id !== prim.voluntario_id &&
            podeTraineeRn11(est, v, voluntarios, papel, culto) &&
            !usadosNoDia.has(v.id)
        )
      }
      const tr = escolher(candsT, papel, est, culto, ev)
      if (tr) {
        const trA: Alocacao = { voluntario_id: tr.id, papel, trainee: true, fixada: false }
        registrarTrainee(est, tr.id, papel, data)
        usadosNoDia.add(tr.id)
        porM.set(papel, [prim, trA])
      }
    }
  }

  return montarListaPorPapel(papeis, porM)
}

// ─── Localização de culto ─────────────────────────────────────────────────────

function findCulto(
  cultos: CultoGerado[],
  data: string,
  ministerio: MinisterioSlug,
  tipo: TipoCulto,
): CultoGerado | null {
  return cultos.find(c => c.data === data && c.ministerio === ministerio && c.tipo === tipo) ?? null
}

// ─── Blocos de alocação por modo ──────────────────────────────────────────────

function alocarBlocoTecnicaEquipeUnica(
  cultos: CultoGerado[],
  eventosMes: Evento[],
  voluntarios: Voluntario[],
  est: Estado,
  datasOrd: string[],
  porId: Map<string, Voluntario>,
  paresTecnicaAP: [string, string][],
  mapaCross: Map<string, string>,
  mapaFixasCulto?: Map<string, AlocacaoFixa[]>,
): void {
  const datasTecnica = new Set(
    cultos
      .filter(c => c.ministerio === "tecnica" && c.tipo === "dominical_manha")
      .map(c => c.data)
  )

  for (const dataIso of [...datasTecnica].sort()) {
    const m = findCulto(cultos, dataIso, "tecnica", "dominical_manha")
    const n = findCulto(cultos, dataIso, "tecnica", "dominical_noite")
    if (!m || !n) continue
    const papeis = papeisExigidos(m, null)
    const alocs = alocarCultoGenericoTecnica(
      voluntarios, m, dataIso, null, papeis, est, datasOrd, porId, paresTecnicaAP, undefined, mapaFixasCulto
    )
    m.alocacoes = alocs
    for (const al of m.alocacoes) {
      if (!al.trainee) rn17RegistrarParceiro(est, mapaCross, al.voluntario_id, dataIso)
    }
    n.alocacoes = m.alocacoes.map(a => ({ ...a }))
  }

  const especiaisTecnica = cultos
    .filter(c => c.ministerio === "tecnica" && c.tipo === "especial")
    .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : (a.nome ?? "").localeCompare(b.nome ?? ""))

  for (const c of especiaisTecnica) {
    const ev = eventoEspecial(eventosMes, c)
    const papeis = papeisExigidos(c, ev)
    c.alocacoes = alocarCultoGenericoTecnica(
      voluntarios, c, c.data, ev, papeis, est, datasOrd, porId, [], undefined, mapaFixasCulto
    )
  }
}

function chaveOrdemTecnica(c: CultoGerado): [string, number, string] {
  const ordem = c.tipo === "dominical_manha" ? 0 : c.tipo === "dominical_noite" ? 1 : 2
  return [c.data, ordem, c.nome ?? ""]
}

function alocarBlocoTecnicaIndependente(
  cultos: CultoGerado[],
  eventosMes: Evento[],
  voluntarios: Voluntario[],
  est: Estado,
  datasOrd: string[],
  porId: Map<string, Voluntario>,
  paresTecnicaAP: [string, string][],
  usadosTecnicaDia: Map<string, Set<string>>,
  mapaFixasCulto?: Map<string, AlocacaoFixa[]>,
): void {
  const cultosTecnica = cultos.filter(
    c => c.ministerio === "tecnica" && (c.tipo === "dominical_manha" || c.tipo === "dominical_noite" || c.tipo === "especial")
  )
  cultosTecnica.sort((a, b) => compareTuples(chaveOrdemTecnica(a), chaveOrdemTecnica(b)))

  for (const c of cultosTecnica) {
    const ev = c.tipo === "especial" ? eventoEspecial(eventosMes, c) : null
    const papeis = papeisExigidos(c, ev)
    let u = usadosTecnicaDia.get(c.data)
    if (!u) { u = new Set(); usadosTecnicaDia.set(c.data, u) }
    const pap = c.tipo !== "especial" ? paresTecnicaAP : []
    c.alocacoes = alocarCultoGenericoTecnica(
      voluntarios, c, c.data, ev, papeis, est, datasOrd, porId, pap, u, mapaFixasCulto
    )
    for (const a of c.alocacoes) u.add(a.voluntario_id)
  }
}

function alocarBlocoBackstageEquipeUnica(
  cultos: CultoGerado[],
  eventosMes: Evento[],
  voluntarios: Voluntario[],
  est: Estado,
  datasOrd: string[],
  porId: Map<string, Voluntario>,
  paresBackstage: [string, string][],
  usadosBackstageDia: Map<string, Set<string>>,
  mapaFixasCulto?: Map<string, AlocacaoFixa[]>,
): void {
  const datasBS = new Set(
    cultos.filter(c => c.ministerio === "backstage" && c.tipo === "dominical_manha").map(c => c.data)
  )
  for (const dataIso of [...datasBS].sort()) {
    const m = findCulto(cultos, dataIso, "backstage", "dominical_manha")
    const n = findCulto(cultos, dataIso, "backstage", "dominical_noite")
    if (!m || !n) continue
    const papeis = papeisExigidos(m, null)
    const uBs = new Set<string>()
    m.alocacoes = alocarBackstageCulto(m, null, papeis, voluntarios, est, uBs, paresBackstage, porId, datasOrd, mapaFixasCulto)
    n.alocacoes = m.alocacoes.map(a => ({ ...a }))
    let uDia = usadosBackstageDia.get(dataIso)
    if (!uDia) { uDia = new Set(); usadosBackstageDia.set(dataIso, uDia) }
    for (const a of m.alocacoes) uDia.add(a.voluntario_id)
  }

  const especiaisBS = cultos
    .filter(c => c.ministerio === "backstage" && c.tipo === "especial")
    .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : (a.nome ?? "").localeCompare(b.nome ?? ""))

  for (const c of especiaisBS) {
    const ev = eventoEspecial(eventosMes, c)
    const papeis = papeisExigidos(c, ev)
    let u = usadosBackstageDia.get(c.data)
    if (!u) { u = new Set(); usadosBackstageDia.set(c.data, u) }
    c.alocacoes = alocarBackstageCulto(c, ev, papeis, voluntarios, est, u, paresBackstage, porId, datasOrd, mapaFixasCulto)
  }
}

function alocarBlocoBackstageIndependente(
  cultos: CultoGerado[],
  eventosMes: Evento[],
  voluntarios: Voluntario[],
  est: Estado,
  datasOrd: string[],
  porId: Map<string, Voluntario>,
  paresBackstage: [string, string][],
  usadosBackstageDia: Map<string, Set<string>>,
  mapaFixasCulto?: Map<string, AlocacaoFixa[]>,
): void {
  const ordemBS = cultos
    .filter(c => c.ministerio === "backstage")
    .sort((a, b) => {
      if (a.data < b.data) return -1
      if (a.data > b.data) return 1
      if (a.tipo < b.tipo) return -1
      if (a.tipo > b.tipo) return 1
      return (a.nome ?? "").localeCompare(b.nome ?? "")
    })

  for (const c of ordemBS) {
    const ev = c.tipo === "especial" ? eventoEspecial(eventosMes, c) : null
    const papeis = papeisExigidos(c, ev)
    let u = usadosBackstageDia.get(c.data)
    if (!u) { u = new Set(); usadosBackstageDia.set(c.data, u) }
    c.alocacoes = alocarBackstageCulto(c, ev, papeis, voluntarios, est, u, paresBackstage, porId, datasOrd, mapaFixasCulto)
    for (const a of c.alocacoes) u.add(a.voluntario_id)
  }
}

// ─── RN-17 fallback pos-alocação ──────────────────────────────────────────────

function rn17MembroPrimarioNoCulto(culto: CultoGerado, volId: string): boolean {
  return culto.alocacoes.some(a => a.voluntario_id === volId && !a.trainee)
}

function rn17PapelFallback(v: Voluntario): PapelSlug | null {
  if (v.papeis.includes("palco")) return "palco"
  if (v.papeis.includes("tecnica_bs")) return "tecnica_bs"
  return null
}

function rn17RemoverAlocacoesPapel(culto: CultoGerado, papel: PapelSlug, est: Estado): void {
  const novas: Alocacao[] = []
  for (const a of culto.alocacoes) {
    if (a.papel !== papel) {
      novas.push(a)
      continue
    }
    if (a.trainee) {
      reverterTraineeSlot(est, a.voluntario_id, a.papel)
    } else {
      decrementarParticipacao(est, a.voluntario_id, a.papel)
    }
  }
  culto.alocacoes = novas
}

function cultoBackstageParRn13Completo(culto: CultoGerado, paresBS: [string, string][]): boolean {
  if (!paresBS.length) return false
  const mapa = mapaPares(paresBS)
  const np = culto.alocacoes.find(a => !a.trainee && a.papel === "palco")?.voluntario_id
  const nt = culto.alocacoes.find(a => !a.trainee && a.papel === "tecnica_bs")?.voluntario_id
  if (!np || !nt) return false
  return mapa.get(np) === nt
}

function rn17PosFallbackParesCross(
  cultos: CultoGerado[],
  est: Estado,
  porId: Map<string, Voluntario>,
  paresCross: [string, string][],
  paresBS: [string, string][],
  modos: Record<MinisterioSlug, ModoEscala>,
): void {
  if (!paresCross.length) return
  const domingos = [...new Set(
    cultos
      .filter(c => c.tipo === "dominical_manha" || c.tipo === "dominical_noite")
      .map(c => c.data)
  )].sort()

  for (const [a, b] of paresCross) {
    const va = porId.get(a)
    const vb = porId.get(b)
    if (!va || !vb) continue
    const modoA = modos[va.ministerio]
    const modoB = modos[vb.ministerio]
    let eqNome: string, bsNome: string
    if (modoA === "equipe_unica" && modoB === "independente") {
      eqNome = a; bsNome = b
    } else if (modoB === "equipe_unica" && modoA === "independente") {
      eqNome = b; bsNome = a
    } else {
      continue
    }
    if (getN(est.participacaoMes, bsNome) > 0) continue
    const vBs = porId.get(bsNome)!
    const papelFb = rn17PapelFallback(vBs)
    if (!papelFb || !elegivelAuto(vBs)) continue

    for (const dataIso of domingos) {
      const cm = findCulto(cultos, dataIso, "tecnica", "dominical_manha")
      const mBs = findCulto(cultos, dataIso, "backstage", "dominical_manha")
      const nBs = findCulto(cultos, dataIso, "backstage", "dominical_noite")
      if (!cm || !mBs || !nBs) continue
      if (!rn17MembroPrimarioNoCulto(cm, eqNome)) continue
      if (rn17MembroPrimarioNoCulto(mBs, bsNome) || rn17MembroPrimarioNoCulto(nBs, bsNome)) continue
      if (
        bloqueado(est, bsNome, dataIso, "dominical_manha") ||
        bloqueado(est, bsNome, dataIso, "dominical_noite")
      ) continue
      if (
        !primarioOk(vBs, papelFb, mBs, dataIso, null, est, true) ||
        !primarioOk(vBs, papelFb, nBs, dataIso, null, est, true)
      ) continue
      if (
        paresBS.length &&
        (cultoBackstageParRn13Completo(mBs, paresBS) || cultoBackstageParRn13Completo(nBs, paresBS))
      ) continue

      rn17RemoverAlocacoesPapel(mBs, papelFb, est)
      rn17RemoverAlocacoesPapel(nBs, papelFb, est)
      mBs.alocacoes.push({ voluntario_id: bsNome, papel: papelFb, trainee: false, fixada: false })
      incrementarParticipacao(est, bsNome, papelFb)
      nBs.alocacoes.push({ voluntario_id: bsNome, papel: papelFb, trainee: false, fixada: false })
      incrementarParticipacao(est, bsNome, papelFb)
      break
    }
  }
}

// ─── RN-15: não-alocados ──────────────────────────────────────────────────────

function domingosMes(mes: string): string[] {
  const [ano, mesNum] = mes.split("-").map(Number)
  const domingos: string[] = []
  const diasNoMes = new Date(ano, mesNum, 0).getDate()
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mesNum - 1, d)
    if (dt.getDay() === 0) {
      domingos.push(`${String(ano).padStart(4, "0")}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
    }
  }
  return domingos
}

function datasDomingosMes(cultos: CultoGerado[]): string[] {
  return [...new Set(
    cultos
      .filter(c => c.tipo === "dominical_manha" || c.tipo === "dominical_noite")
      .map(c => c.data)
  )].sort()
}

function computarNaoAlocados(
  mes: string,
  voluntarios: Voluntario[],
  cultos: CultoGerado[],
  bloqueios: Set<string>,
): [string, string][] {
  const prefixo = mes.slice(0, 7)
  const idsPrim = new Set<string>()
  for (const c of cultos) {
    if (!c.data.startsWith(prefixo)) continue
    for (const a of c.alocacoes) {
      if (!a.trainee) idsPrim.add(a.voluntario_id)
    }
  }
  const domingos = domingosMes(mes)
  const nao: [string, string][] = []
  for (const v of voluntarios) {
    if (!v.ativo || apenasManual(v)) continue
    if (!v.papeis.length) continue
    if (idsPrim.has(v.id)) continue
    if (domingos.length > 0 && domingos.every(d => bloqueios.has(kBloqueio(v.id, d)))) {
      nao.push([v.nome, "Indisponível em todas as datas elegíveis do mês."])
    } else {
      nao.push([
        v.nome,
        "Número de cultos no mês insuficiente para cobrir todos os voluntários deste perfil sem violar outras regras.",
      ])
    }
  }
  return nao
}

// ─── Resolução de modos ───────────────────────────────────────────────────────

export function resolverModosMinisterio(
  configs: ConfigMinisterio[],
  override?: Partial<Record<MinisterioSlug, ModoEscala>>,
): Record<MinisterioSlug, ModoEscala> {
  const modos: Record<MinisterioSlug, ModoEscala> = {
    tecnica: "equipe_unica",
    backstage: "independente",
  }
  for (const c of configs) {
    modos[c.slug] = c.modo
  }
  if (override) Object.assign(modos, override)
  return modos
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function alocarEscala(
  mes: string,
  voluntarios: Voluntario[],
  ausencias: Ausencia[],
  eventosMes: Evento[],
  cultos: CultoGerado[],
  pares: Par[] = [],
  modosMinisterio: Record<MinisterioSlug, ModoEscala> = { tecnica: "equipe_unica", backstage: "independente" },
  paresCross: [string, string][] = [],
  fixasCultoPorSlot?: Map<string, AlocacaoFixa[]>,
): [CultoGerado[], string[], [string, string][]] {
  const modos = modosMinisterio
  const bloqueiosSet = calcBloqueios(ausencias)
  const est = criarEstado(bloqueiosSet, ausencias)
  const porId = volPorId(voluntarios)
  const mapaCross = mapaPares(paresCross)
  const paresTecnicaAP = paresTecnicaAudioProjecao(pares, porId)
  const paresBS = paresBackstageTuplas(pares)
  const datasOrd = datasDomingosMes(cultos)

  const usadosTecnicaDia = new Map<string, Set<string>>()
  const usadosBackstageDia = new Map<string, Set<string>>()

  for (const ministerio of MINISTERIOS_ORDEM_ALOCACAO) {
    const modo = modos[ministerio]
    if (ministerio === "tecnica") {
      if (modo === "equipe_unica") {
        alocarBlocoTecnicaEquipeUnica(cultos, eventosMes, voluntarios, est, datasOrd, porId, paresTecnicaAP, mapaCross, fixasCultoPorSlot)
      } else {
        alocarBlocoTecnicaIndependente(cultos, eventosMes, voluntarios, est, datasOrd, porId, paresTecnicaAP, usadosTecnicaDia, fixasCultoPorSlot)
      }
    } else {
      if (modo === "equipe_unica") {
        alocarBlocoBackstageEquipeUnica(cultos, eventosMes, voluntarios, est, datasOrd, porId, paresBS, usadosBackstageDia, fixasCultoPorSlot)
      } else {
        alocarBlocoBackstageIndependente(cultos, eventosMes, voluntarios, est, datasOrd, porId, paresBS, usadosBackstageDia, fixasCultoPorSlot)
      }
    }
  }

  rn17PosFallbackParesCross(cultos, est, porId, paresCross, paresBS, modos)

  const nao = computarNaoAlocados(mes, voluntarios, cultos, bloqueiosSet)
  return [cultos, est.alertas, nao]
}
