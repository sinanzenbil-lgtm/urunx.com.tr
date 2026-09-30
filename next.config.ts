import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
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
