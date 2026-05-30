import type { Config } from "tailwindcss";

// Command-center palette: dense, high-contrast, readable on phones and ultra-wide monitors alike.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        desk: {
          bg: "#0a0e14",
          panel: "#111722",
          panel2: "#161d2b",
          border: "#243044",
          muted: "#7d8aa3",
          text: "#e6edf7",
          go: "#16c784",
          nogo: "#ea3943",
          warn: "#f5a623",
          accent: "#3b82f6",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      screens: {
        // Treat very wide monitors as a distinct breakpoint for multi-column desk layout.
        "3xl": "1920px",
        "4xl": "2560px",
      },
    },
  },
  plugins: [],
};

export default config;
