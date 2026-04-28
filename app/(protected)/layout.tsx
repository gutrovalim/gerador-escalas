import { Nav } from "@/components/nav"

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gh-bg">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
