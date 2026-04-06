import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  experimental: {
    // Ürün görselleri (base64) toplu kayıtta Server Action gövdesi büyüyebilir
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  // Fix Turbopack choosing wrong workspace root when multiple lockfiles exist
  turbopack: {
    // Use the directory containing this config file (NOT process.cwd()).
    // Next may infer a different workspace root when multiple lockfiles exist.
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
