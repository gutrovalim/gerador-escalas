import { createClient } from "@/lib/supabase/server"
import { mesReferenciaPadrao, ultimoDiaDoMesISO } from "@/lib/mes"
import { primeiroValorQuery } from "@/lib/search-params"
import { EventosClient } from "./client"

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const sp = await searchParams
  const mesQ = primeiroValorQuery(sp.mes)
  const mes = mesQ && /^\d{4}-\d{2}$/.test(mesQ) ? mesQ : mesReferenciaPadrao()
  const inicio = `${mes}-01`
  const fim = ultimoDiaDoMesISO(mes)

  const supabase = await createClient()
  const [{ data: eventos }, { data: voluntarios }] = await Promise.all([
    supabase
      .from("eventos")
      .select("*, alocacoes_fixas(*)")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data"),
    supabase.from("voluntarios").select("id, nome, ministerio, papeis").eq("ativo", true).order("nome"),
  ])

  return <EventosClient mes={mes} eventos={eventos ?? []} voluntarios={voluntarios ?? []} />
}
