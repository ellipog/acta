import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Self-hosted behind a Cloudflare Tunnel: build request URLs from the Host header
    // (acta.aaenz.no), not the internal 127.0.0.1:4660 the server listens on.
    trustHostHeader: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
