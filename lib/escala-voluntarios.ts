import type { Ausencia, TipoCulto } from "@/lib/scheduler/types"
import { voluntarioAusenteNoCulto } from "@/lib/ausencia-alocacao"

/** Voluntários elegíveis para um slot da escala (primário = tem papel; trainee = em treinamento). */
export function voluntariosElegiveisParaSlot(
  ministerio: "tecnica" | "backstage",
  papel: string,
  trainee: boolean,
  lista: Array<{
    id: string
    nome: string
    ministerio: string
    papeis?: string[] | null
    treinamento?: string[] | null
    ativo?: boolean | null
  }>,
  selecionadoId: string | undefined,
  slot?: { data: string; tipo: TipoCulto },
  ausencias?: Ausencia[],
): typeof lista {
  return lista.filter(v => {
    if (v.ministerio !== ministerio) return false
    if (selecionadoId && v.id === selecionadoId) return true
    if (v.ativo === false) return false
    if (
      slot &&
      ausencias?.length &&
      voluntarioAusenteNoCulto(ausencias, v.id, slot.data, slot.tipo)
    ) {
      return false
    }
    const papeisV = Array.isArray(v.papeis) ? v.papeis : []
    const treino = Array.isArray(v.treinamento) ? v.treinamento : []
    if (trainee) return treino.includes(papel)
    return papeisV.includes(papel)
  })
}
