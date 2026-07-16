import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plan: {
          bg: "#f4f5f7",
          panel: "#ffffff",
          panel2: "#f9fafb",
          border: "#e5e7eb",
          muted: "#6b7280",
          text: "#111827",
          "text-secondary": "#374151",
          green: "#008361",
          "green-light": "#e6f4ef",
          "green-dark": "#006b4f",
          go: "#008361",
          nogo: "#dc2626",
          warn: "#d97706",
          accent: "#008361",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        header: "0 1px 0 0 rgba(0, 0, 0, 0.06)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
