import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Scope file tracing to this app (not the parent market-desk repo).
  outputFileTracingRoot: dir,
  experimental: {
    optimizePackageImports: ["drizzle-orm"],
  },
};

export default nextConfig;
