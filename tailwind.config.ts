import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gh: {
          bg: "#0d1117",
          surface: "#161b22",
          "surface-2": "#21262d",
          border: "#30363d",
          text: "#c9d1d9",
          muted: "#8b949e",
          accent: "#58a6ff",
          green: "#3fb950",
          red: "#f85149",
          yellow: "#d29922",
        },
      },
    },
  },
  plugins: [],
}

export default config
