import { dataIsoDia } from "@/lib/mes"
import type { Ausencia, TipoCulto } from "@/lib/scheduler/types"

/**
 * Replica RN-04 (`bloqueado` em `algorithm.ts`): o voluntário não pode ser alocado neste culto
 * por causa de ausência cadastrada.
 */
export function voluntarioAusenteNoCulto(
  ausencias: Ausencia[],
  volId: string,
  data: string,
  tipoCulto: TipoCulto,
): boolean {
  const dia = dataIsoDia(data)
  for (const ind of ausencias) {
    if (ind.voluntario_id !== volId || dataIsoDia(ind.data) !== dia) continue
    const escopo = ind.escopo ?? "ambos"
    if (tipoCulto === "especial") {
      if (escopo === "cultos") continue
      return true
    }
    if (escopo === "eventos") continue
    const turnos = ind.turnos.length === 0 ? ["manha", "noite"] : ind.turnos
    if (tipoCulto === "dominical_manha" && turnos.includes("manha")) return true
    if (tipoCulto === "dominical_noite" && turnos.includes("noite")) return true
  }
  return false
}
