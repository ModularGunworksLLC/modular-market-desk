/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle for the Lightsail Docker image.
  output: "standalone",
  reactStrictMode: true,
  // The legacy `engine/` and `web/` folders are git-ignored leftovers; never compile them.
  // Distributor CSVs are multi-MB. With middleware on /api/*, Next buffers the body and
  // defaults middlewareClientMaxBodySize to 10MB — larger uploads get truncated and
  // request.formData() fails (opaque "Expected multipart/form-data" on the import UI).
  experimental: {
    optimizePackageImports: ["drizzle-orm"],
    middlewareClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
