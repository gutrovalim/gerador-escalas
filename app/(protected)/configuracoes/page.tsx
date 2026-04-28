import { createClient } from "@/lib/supabase/server"
import { ConfiguracoesClient } from "./client"

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: configs } = await supabase.from("config_ministerios").select("*")

  return <ConfiguracoesClient configs={configs ?? []} />
}
