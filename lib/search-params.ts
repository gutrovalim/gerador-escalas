/** Next.js 15: cada chave de query pode ser `string | string[]`. */
export function primeiroValorQuery(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}
