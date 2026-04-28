import { createClient } from "@/lib/supabase/server"
import { VoluntariosClient } from "./client"

export default async function VoluntariosPage() {
  const supabase = await createClient()
  const [{ data: voluntarios }, { data: pares }] = await Promise.all([
    supabase
      .from("voluntarios")
      .select("id, nome, ministerio, papeis, treinamento, restricoes, ativo")
      .order("nome"),
    supabase.from("pares").select("*, m1:membro_1(nome), m2:membro_2(nome)"),
  ])

  return <VoluntariosClient voluntarios={voluntarios ?? []} pares={pares ?? []} />
}
