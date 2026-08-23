import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Funnel snapshots/imports are capped below 1 MB by application validation,
    // but the encrypted Server Action envelope adds overhead.
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
