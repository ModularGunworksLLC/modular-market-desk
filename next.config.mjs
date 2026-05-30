/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle for the Lightsail Docker image.
  output: "standalone",
  reactStrictMode: true,
  // The legacy `engine/` and `web/` folders are git-ignored leftovers; never compile them.
  experimental: {
    optimizePackageImports: ["drizzle-orm"],
  },
};

export default nextConfig;
