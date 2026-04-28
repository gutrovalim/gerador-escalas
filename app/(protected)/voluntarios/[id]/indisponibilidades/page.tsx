import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { AusenciasVolClient } from "./client"

export default async function IndisponibilidadesVolPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const hoje = new Date().toISOString().slice(0, 10)

  const [{ data: voluntario }, { data: ausencias }, { data: eventosRows }] = await Promise.all([
    supabase.from("voluntarios").select("id, nome, ativo").eq("id", id).single(),
    supabase.from("indisponibilidades").select("*").eq("voluntario_id", id).order("data"),
    supabase.from("eventos").select("id, nome, data").eq("ativo", true).gte("data", hoje).order("data").limit(120),
  ])

  if (!voluntario || !voluntario.ativo) notFound()

  const eventos =
    (eventosRows ?? []).map(r => ({
      id: String(r.id ?? ""),
      nome: typeof r.nome === "string" ? r.nome.trim() : "",
      data: typeof r.data === "string" ? r.data.slice(0, 10) : String(r.data ?? "").slice(0, 10),
    })) ?? []

  return (
    <AusenciasVolClient
      voluntario={voluntario}
      ausencias={ausencias ?? []}
      eventos={eventos}
    />
  )
}
