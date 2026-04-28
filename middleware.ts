import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

/** Cookie de sessão Supabase (padrão `sb-<ref>-auth-token`). Usado só para atalho em prefetch. */
function temCookieSessaoSupabase(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    c => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  /** Só prefetch (hover em `<Link>`). Não usar o header `RSC` — também vem na navegação real. */
  const isPrefetch = request.headers.get("Next-Router-Prefetch") === "1"

  if (isPrefetch && !pathname.startsWith("/login")) {
    if (temCookieSessaoSupabase(request)) {
      return NextResponse.next()
    }
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user ?? null

  if (!user && !pathname.startsWith("/login")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/escalas"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
