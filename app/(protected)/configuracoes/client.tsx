"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ConfirmDialog"

interface ConfigMinisterio { slug: string; modo: string }

const selectCls = "w-full bg-gh-surface-2 border border-gh-border rounded-lg px-3 py-2 text-sm text-gh-text focus:outline-none focus:border-gh-accent focus:ring-1 focus:ring-gh-accent"
const labelCls = "block text-xs font-medium text-gh-muted mb-1.5 uppercase tracking-wide"

export function ConfiguracoesClient({ configs }: { configs: ConfigMinisterio[] }) {
  const configMap = new Map(configs.map(c => [c.slug, c.modo]))
  const [modoTecnica, setModoTecnica] = useState(configMap.get("tecnica") ?? "equipe_unica")
  const [modoBackstage, setModoBackstage] = useState(configMap.get("backstage") ?? "independente")
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null)
  const { confirm, dialog } = useConfirm()
  const supabase = useMemo(() => createClient(), [])

  async function salvar() {
    const ok = await confirm({
      title: "Guardar configurações?",
      description: "Os modos de escala por ministério serão gravados e usados na próxima geração.",
      confirmLabel: "Guardar",
    })
    if (!ok) return
    setSalvando(true)
    setMsg(null)
    for (const upd of [{ slug: "tecnica", modo: modoTecnica }, { slug: "backstage", modo: modoBackstage }]) {
      const { error } = await supabase.from("config_ministerios").upsert(upd, { onConflict: "slug" })
      if (error) {
        setMsg({ tipo: "erro", texto: "Erro ao salvar: " + error.message })
        setSalvando(false)
        return
      }
    }
    setSalvando(false)
    setMsg({ tipo: "ok", texto: "Configurações salvas com sucesso." })
  }

  return (
    <div>
      {dialog}
      <h1 className="text-2xl font-semibold text-gh-text mb-6">Configurações</h1>

      <div className="bg-gh-surface border border-gh-border rounded-xl p-6 max-w-md mb-6">
        <h2 className="text-sm font-semibold text-gh-text mb-5">Modo de escala por ministério</h2>

        <div className="space-y-5">
          <div>
            <label className={labelCls}>Técnica</label>
            <select value={modoTecnica} onChange={e => setModoTecnica(e.target.value)} className={selectCls}>
              <option value="equipe_unica">Equipe Única (manhã = noite)</option>
              <option value="independente">Independente (manhã ≠ noite)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Backstage</label>
            <select value={modoBackstage} onChange={e => setModoBackstage(e.target.value)} className={selectCls}>
              <option value="independente">Independente (manhã ≠ noite)</option>
              <option value="equipe_unica">Equipe Única (manhã = noite)</option>
            </select>
          </div>
        </div>

        {msg && (
          <div className={`mt-5 border-l-2 rounded-r-lg px-3 py-2 text-sm ${
            msg.tipo === "erro"
              ? "border-gh-red bg-gh-red/10 text-gh-red"
              : "border-gh-green bg-gh-green/10 text-gh-green"
          }`}>
            {msg.texto}
          </div>
        )}

        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="mt-6 bg-gh-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1f6feb] disabled:opacity-50 transition-colors"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>

      <div className="bg-gh-surface border border-gh-border rounded-xl p-6 max-w-md">
        <h2 className="text-sm font-semibold text-gh-text mb-3">Variáveis de ambiente</h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gh-green inline-block" />
            <code className="bg-gh-surface-2 border border-gh-border rounded px-2 py-0.5 text-gh-muted">
              NEXT_PUBLIC_SUPABASE_URL
            </code>
            <span className="text-gh-muted">configurada</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gh-green inline-block" />
            <code className="bg-gh-surface-2 border border-gh-border rounded px-2 py-0.5 text-gh-muted">
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
            </code>
            <span className="text-gh-muted">configurada</span>
          </div>
        </div>
      </div>
    </div>
  )
}
