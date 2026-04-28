export default function ProtectedLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="A carregar">
      <div className="h-8 w-48 rounded bg-gh-surface-2" />
      <div className="h-32 rounded-xl bg-gh-surface border border-gh-border" />
      <div className="h-24 rounded-xl bg-gh-surface border border-gh-border" />
    </div>
  )
}
