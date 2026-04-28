"use client"

import { useCallback, useRef, useState } from "react"

export type ConfirmVariant = "danger" | "default"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

/**
 * Diálogo modal acessível (sem `window.confirm`, compatível com iframes / previews).
 * Renderize `dialog` junto ao JSX do componente e chame `confirm(opts)` antes da ação.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" })
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
      setOptions({
        confirmLabel: "Confirmar",
        cancelLabel: "Cancelar",
        variant: "default",
        ...opts,
      })
      setOpen(true)
    })
  }, [])

  const finish = useCallback((value: boolean) => {
    setOpen(false)
    const r = resolveRef.current
    resolveRef.current = null
    r?.(value)
  }, [])

  const dialog = open ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        aria-label="Fechar"
        onClick={() => finish(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-gh-border bg-gh-surface p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gh-text">
          {options.title}
        </h2>
        {options.description ? (
          <p className="mt-2 text-sm text-gh-muted leading-relaxed">{options.description}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => finish(false)}
            className="rounded-lg border border-gh-border px-4 py-2 text-sm text-gh-muted hover:bg-gh-surface-2 hover:text-gh-text transition-colors"
          >
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              options.variant === "danger"
                ? "bg-gh-red text-white hover:opacity-90"
                : "bg-gh-accent text-white hover:opacity-90"
            }`}
          >
            {options.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, dialog }
}
