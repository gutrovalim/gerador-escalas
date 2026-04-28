import { dataIsoDia } from "@/lib/mes"
import type { AlocacaoFixa } from "@/lib/scheduler/types"

/**
 * Chave estável com `gerarCultos` / algoritmo: `YYYY-MM-DD|dominical_manha|tecnica` etc.
 */
export function chaveSlotFixaCulto(
  data: string,
  tipoCulto: "dominical_manha" | "dominical_noite",
  ministerio: "tecnica" | "backstage",
): string {
  return `${dataIsoDia(data)}|${tipoCulto}|${ministerio}`
}

export function mapaFixasCultoDesdeLinhas(
  rows: Record<string, unknown>[],
): Map<string, AlocacaoFixa[]> {
  const map = new Map<string, AlocacaoFixa[]>()
  for (const r of rows) {
    const data = dataIsoDia(r.data)
    const tipo = String(r.tipo_culto ?? "")
    const min = String(r.ministerio ?? "")
    if (!data || !tipo || !min) continue
    const k = `${data}|${tipo}|${min}`
    const arr = map.get(k) ?? []
    arr.push({
      papel: r.papel as AlocacaoFixa["papel"],
      voluntario_id: String(r.voluntario_id ?? ""),
    })
    map.set(k, arr)
  }
  return map
}
