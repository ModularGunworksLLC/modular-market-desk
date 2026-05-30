import { defineConfig } from "vite";

// Production desk (desk.modulargunworks.com): VITE_BASE_PATH=/
// GitHub Pages only: VITE_BASE_PATH=/modular-market-desk/
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        connections: "connections.html",
      },
    },
  },
});
