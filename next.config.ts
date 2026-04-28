import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Importa só os módulos usados de cada pacote (bundle menor em produção).
    optimizePackageImports: [
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
    ],
  },
}

export default nextConfig
