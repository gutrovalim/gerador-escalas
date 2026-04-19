import { redirect } from "next/navigation"

/**
 * URL curta / bookmark antigo: a gestão de ausências é por voluntário em
 * /voluntarios/[id]/indisponibilidades. Evita 500 do dev server nessa rota inexistente.
 */
export default function IndisponibilidadesRedirectPage() {
  redirect("/voluntarios")
}
