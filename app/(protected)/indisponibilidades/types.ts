export type ColunaAusencia = {
  /** Único por coluna (a mesma data pode ter coluna de domingo e coluna(s) de evento) */
  key: string
  iso: string
  domingo: boolean
  evento: boolean
  /** Nome do evento nesta coluna; só quando `evento === true` */
  nomeEvento: string | null
}
