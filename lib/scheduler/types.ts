export type MinisterioSlug = "backstage" | "tecnica"

export type ModoEscala = "equipe_unica" | "independente"

export type PapelSlug =
  | "palco"
  | "tecnica_bs"
  | "audio"
  | "projecao"
  | "iluminacao"

export type RestricaoTipo = "somente_manha" | "somente_noite" | "apenas_manual"

export type TipoCulto = "dominical_manha" | "dominical_noite" | "especial"

export const MINISTERIOS_ORDEM_ALOCACAO: MinisterioSlug[] = ["tecnica", "backstage"]

export const PAPEIS_TECNICA = new Set<PapelSlug>(["audio", "projecao", "iluminacao"])
export const PAPEIS_BACKSTAGE = new Set<PapelSlug>(["palco", "tecnica_bs"])

export interface Voluntario {
  id: string
  nome: string
  ministerio: MinisterioSlug
  papeis: PapelSlug[]
  treinamento: PapelSlug[]
  restricoes: RestricaoTipo[]
  ativo: boolean
}

/** cultos: só domingo (turnos); eventos: só culto especial nesse dia; ambos: legado (afeta os dois). */
export type EscopoAusencia = "cultos" | "eventos" | "ambos"

export interface Ausencia {
  voluntario_id: string
  data: string
  turnos: string[]
  escopo?: EscopoAusencia
}

export interface ConfigMinisterio {
  slug: MinisterioSlug
  modo: ModoEscala
}

export interface Par {
  ativo?: boolean
  membro_1: string
  membro_2: string
  ministerio: MinisterioSlug | null
  tipo: "par" | "par_cross"
}

export interface AlocacaoFixa {
  papel: PapelSlug
  voluntario_id: string
}

export interface Evento {
  id: string
  nome: string
  data: string
  horario_inicio: string
  horario_fim?: string
  ministerios: MinisterioSlug[]
  papeis?: PapelSlug[]
  alocacoes_fixas?: AlocacaoFixa[]
}

export interface Alocacao {
  voluntario_id: string
  papel: PapelSlug
  trainee: boolean
  fixada: boolean
}

export interface CultoGerado {
  data: string
  tipo: TipoCulto
  nome?: string
  /** Preenchido na UI/export a partir de `eventos` (tipo especial). */
  horario_inicio?: string
  horario_fim?: string
  ministerio: MinisterioSlug
  alocacoes: Alocacao[]
}
