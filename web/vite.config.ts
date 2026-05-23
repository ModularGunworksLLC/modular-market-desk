import { defineConfig } from "vite";

// GitHub Pages: VITE_BASE_PATH=/modular-market-desk/
// Lightsail desk subdomain: VITE_BASE_PATH=/
const base = process.env.VITE_BASE_PATH ?? "/modular-market-desk/";

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
});
